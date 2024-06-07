import BigNumber from "bignumber.js";
import { AMM_TYPES, CHAINS, PROTOCOLS, SUBGRAPH_URLS } from "./config";
import { PositionMath } from "./utils/positionMath";
import fs from "fs";
import { write } from "fast-csv";
import path from "path";

export function logWithTimestamp(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}](${Date.now()})  ${message}`);
}
export interface UserAggregatedAssetsInPools {
  volume: BigNumber;
  amountFeeUSD: BigNumber;
}
export interface PoolDetails {
  poolId: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: number;
}

export interface TokenDetails {
  id: string;
  decimals: number;
  name: string;
  symbol: string;
  derivedUSD?: number;
}

export interface SwapCSVRow {
  timestamp: number;
  id: string;
  amount0: number;
  amount1: number;
  amountUSD: number;
  amountFeeUSD: number;
  sender: string;
  poolId: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Address: string;
  token1Address: string;
  sqrtPrice: number;
  tick: number;
  feeTier: number;
}

export interface Swap {
  id: string;
  timestamp: number;
  amount0: bigint;
  amount1: bigint;
  amountUSD: bigint;
  amountFeeUSD: bigint;
  sender: string;
  pool: {
    id: string;
    sqrtPrice: bigint;
    tick: number;
    feeTier: number;
  };
  token0: TokenDetails;
  token1: TokenDetails;
}

export interface PositionWithUSDValue extends Swap {
  token0USDValue: string;
  token1USDValue: string;
  token0AmountsInWei: bigint;
  token1AmountsInWei: bigint;
  token0DecimalValue: number;
  token1DecimalValue: number;
  feeTier: number;
  token0Symbol: string;
  token1Symbol: string;
}

export interface SwapResponse {
  success: boolean;
  index: number;
  data: Swap[];
}

export const getSwapsForAddressByPoolAtBlockForOneQuery = async (
  fromBlock: number,
  startTimestamp: number,
  endTimestamp: number,
  address: string,
  poolIds: string[],
  chainId: CHAINS,
  protocol: PROTOCOLS,
  ammType: AMM_TYPES,
  index: number,
  batchSize: number,
  dataSize: number
): Promise<SwapResponse> => {
  let subgraphUrl = SUBGRAPH_URLS[chainId][protocol][ammType];
  let blockQuery = fromBlock !== 0 ? ` block: {number: ${fromBlock}}` : ``;
  let timestampQuery =
    startTimestamp !== 0 || endTimestamp !== 0
      ? `timestamp_gte:${startTimestamp}, timestamp_lt:${endTimestamp}`
      : ``;
  let poolQuery = poolIds.length > 0 ? `pool_in:${poolIds}` : ``;
  let ownerQuery = address !== "" ? `sender: "${address.toLowerCase()}"` : ``;

  let whereQuery =
    ownerQuery !== "" && poolQuery !== "" && timestampQuery !== ""
      ? `where: {${ownerQuery} , ${poolQuery}, ${timestampQuery}}`
      : ownerQuery !== ""
      ? `where: {${ownerQuery}, ${timestampQuery}}`
      : poolQuery !== ""
      ? `where: {${poolQuery}, ${timestampQuery}}`
      : ``;

  let result: Swap[] = [];
  let skip = index * dataSize;

  // logWithTimestamp(`Fetching swaps from ${skip} to ${skip + dataSize}`);
  let query = `{
            swaps(${whereQuery} ${blockQuery} orderBy: transaction__timestamp,first: ${dataSize},skip:${skip}) {
              id
              origin
              amount0
              amount1
              amountUSD
              amountFeeUSD
              timestamp
              pool {
                id
                sqrtPrice
                tick
                feeTier
              }
              token0 {
                  id
                  decimals
                  derivedUSD
                  name
                  symbol
              }
              token1 {
                  id
                  decimals
                  derivedUSD
                  name
                  symbol
              }
            }
        }`;

  // console.log(query);

  try {
    logWithTimestamp(`Fetching swaps from ${skip} to ${skip + dataSize}`);

    let response = await fetch(subgraphUrl, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: { "Content-Type": "application/json" },
    });

    let data = await response.json();

    logWithTimestamp(`Fetched swaps from ${skip} to ${skip + dataSize}`);

    console.log(data);

    let swapList = data.data.swaps;
    for (let i = 0; i < swapList.length; i++) {
      let swap = swapList[i];
      let transformedPosition: Swap = {
        id: swap.id,
        timestamp: swap.timestamp,
        amount0: swap.amount0,
        amount1: swap.amount1,
        amountUSD: swap.amountUSD,
        amountFeeUSD: swap.amountFeeUSD,
        sender: swap.origin,
        pool: {
          sqrtPrice: BigInt(swap.pool.sqrtPrice),
          tick: Number(swap.pool.tick),
          id: swap.pool.id,
          feeTier: Number(swap.pool.feeTier),
        },
        token0: {
          id: swap.token0.id,
          decimals: swap.token0.decimals,
          derivedUSD: swap.token0.derivedUSD,
          name: swap.token0.name,
          symbol: swap.token0.symbol,
        },
        token1: {
          id: swap.token1.id,
          decimals: swap.token1.decimals,
          derivedUSD: swap.token1.derivedUSD,
          name: swap.token1.name,
          symbol: swap.token1.symbol,
        },
      };
      result.push(transformedPosition);
    }
    logWithTimestamp(`Swaps fetched: ${result.length}`);

    logWithTimestamp(`Round: ${skip / dataSize}, Swap data: ${skip}`);

    return {
      success: true,
      index: index,
      data: result,
    };
  } catch (error) {
    logWithTimestamp(
      `Error fetching swaps from ${skip} to ${skip + dataSize}: ${error}`
    );
    return {
      success: false,
      index: index,
      data: [],
    };
  }
};
export const getSwapsForAddressByPoolAtBlock = async (
  fromBlock: number,
  startTimestamp: number,
  endTimestamp: number,
  address: string,
  poolIds: string[],
  chainId: CHAINS,
  protocol: PROTOCOLS,
  ammType: AMM_TYPES,
  initialRequestIndices: { index: number; pending: boolean }[],
  batchSize: number,
  dataSize: number,
  prePopulatedData: SwapCSVRow[]
): Promise<SwapCSVRow[]> => {
  let skip = 0;
  let fetchNext = true;
  let result: SwapCSVRow[] = [];
  let responseSuccess: boolean[] = [];
  // initialize requestIndices number array from 0 to 49
  let requestIndices = initialRequestIndices;

  let lastSuccessfulRequestIndex = 0;

  // push large data in array
  let currentIndex = 0;
  while (currentIndex < prePopulatedData.length) {
    const chunkSize = 1000; // Number of items to process in each interval
    const chunk = prePopulatedData.slice(
      currentIndex,
      currentIndex + chunkSize
    );
    result.push(...chunk);
    currentIndex += chunkSize;
  }

  while (fetchNext) {
    let queryPromises = requestIndices.map((requestIndex) => {
      return getSwapsForAddressByPoolAtBlockForOneQuery(
        fromBlock,
        startTimestamp,
        endTimestamp,
        address,
        poolIds,
        chainId,
        protocol,
        ammType,
        requestIndex.index,
        batchSize,
        dataSize
      );
    });

    let responses = await Promise.all(queryPromises);
    let successfulResponses = responses.filter((response) => response.success);
    let failedResponses = responses.filter((response) => !response.success);
    if (successfulResponses.length > 0) {
      lastSuccessfulRequestIndex =
        successfulResponses[successfulResponses.length - 1].index;
      result.push(
        ...successfulResponses
          .map((response) => response.data)
          .flat()
          .map((swap) => {
            return {
              timestamp: swap.timestamp,
              id: swap.id,
              amount0: Number(swap.amount0),
              amount1: Number(swap.amount1),
              amountUSD: Number(swap.amountUSD),
              amountFeeUSD: Number(swap.amountFeeUSD),
              sender: swap.sender,
              poolId: swap.pool.id,
              token0Symbol: swap.token0.symbol,
              token1Symbol: swap.token1.symbol,
              token0Address: swap.token0.id,
              token1Address: swap.token1.id,
              sqrtPrice: Number(swap.pool.sqrtPrice),
              tick: Number(swap.pool.tick),
              feeTier: Number(swap.pool.feeTier),
            };
          })
      );
    }

    logWithTimestamp(
      `Last successful request index: ${lastSuccessfulRequestIndex}`
    );
    logWithTimestamp(`Failed requests: ${failedResponses.length}`);
    logWithTimestamp(`Successful requests: ${successfulResponses.length}`);

    // if all requests succeeded and one of them has less than 100 swaps, fetchNext = false
    if (
      failedResponses.length === 0 &&
      successfulResponses.length > 0 &&
      successfulResponses.some((response) => response.data.length < dataSize)
    ) {
      fetchNext = false;
      logWithTimestamp(`No more fetchRequired`);
    }

    if (fetchNext) {
      // remove all successful requests from requestIndices based on successfulResponse and keep indices for failedResponse
      requestIndices = requestIndices.filter((requestIndex) =>
        successfulResponses
          .map((response) => response.index)
          .includes(requestIndex.index)
          ? false
          : true
      );
      logWithTimestamp(`New Request indices: ${requestIndices.length}`);

      // fill requestIndices by adding remaining indices from last successful request index
      requestIndices = requestIndices.concat(
        Array.from({ length: batchSize - requestIndices.length }, (_, i) => {
          return { index: i + lastSuccessfulRequestIndex + 1, pending: true };
        })
      );

      logWithTimestamp(`Request indices length: ${requestIndices.length}`);

      logWithTimestamp(
        `Request indices: ${requestIndices.map(
          (requestIndex) => requestIndex.index
        )}`
      );
    }

    const outputPath = path.resolve(
      __dirname,
      "../../pre_mode_supswapv3_volume_snapshot.csv"
    );

    const ws = fs.createWriteStream(outputPath);
    await writeCSVWithPromise(result, ws);

    //  write a text file with the last successful request index

    let inputFile = path.resolve(__dirname, "../../input.csv");

    fs.writeFileSync(
      inputFile,
      requestIndices.map((requestIndex) => requestIndex.index).toString()
    );
    fs.writeFileSync(inputFile, "\n", { flag: "a" });
    fs.writeFileSync(inputFile, dataSize.toString(), { flag: "a" });
    console.log(`Last successful request index: ${lastSuccessfulRequestIndex}`);
  }
  return result;
};

export function writeCSVWithPromise(
  csvRows: SwapCSVRow[],
  ws: fs.WriteStream
): Promise<void> {
  return new Promise((resolve, reject) => {
    write(csvRows)
      .pipe(ws)
      .on("finish", () => {
        logWithTimestamp("CSV file has been written.");
        resolve();
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

// export const getPositionAtBlock = async (
//   blockNumber: number,
//   positionId: number,
//   chainId: CHAINS,
//   protocol: PROTOCOLS,
//   ammType: AMM_TYPES
// ): Promise<Swap> => {
//   let subgraphUrl = SUBGRAPH_URLS[chainId][protocol][ammType];
//   let blockQuery = blockNumber !== 0 ? `, block: {number: ${blockNumber}}` : ``;
//   let query = `{
//         position(id: "${positionId}" ${blockQuery}) {
//             id
//             pool {
//                 sqrtPrice
//                 tick
//             }
//             tickLower{
//                 tickIdx
//             }
//             tickUpper{
//                 tickIdx
//             }
//             liquidity
//             token0 {
//                 id
//                 decimals
//                 derivedUSD
//                 name
//                 symbol
//             }
//             token1 {
//                 id
//                 decimals
//                 derivedUSD
//                 name
//                 symbol
//             }
//         },
//         _meta{
//                 block{
//                 number
//             }
//         }
//     }`;
//   let response = await fetch(subgraphUrl, {
//     method: "POST",
//     body: JSON.stringify({ query }),
//     headers: { "Content-Type": "application/json" },
//   });
//   let data = await response.json();
//   let position = data.data.position;

//   return {
//     id: position.id,
//     liquidity: BigInt(position.liquidity),
//     owner: position.owner,
//     pool: {
//       sqrtPrice: BigInt(position.pool.sqrtPrice),
//       tick: Number(position.pool.tick),
//       id: position.pool.id,
//       feeTier: Number(position.pool.feeTier),
//     },
//     tickLower: {
//       tickIdx: Number(position.tickLower.tickIdx),
//     },
//     tickUpper: {
//       tickIdx: Number(position.tickUpper.tickIdx),
//     },
//     token0: {
//       id: position.token0.id,
//       decimals: position.token0.decimals,
//       derivedUSD: position.token0.derivedUSD,
//       name: position.token0.name,
//       symbol: position.token0.symbol,
//     },
//     token1: {
//       id: position.token1.id,
//       decimals: position.token1.decimals,
//       derivedUSD: position.token1.derivedUSD,
//       name: position.token1.name,
//       symbol: position.token1.symbol,
//     },
//   };

//   // let tickLow = Number(position.tickLower.tickIdx);
//   // let tickHigh = Number(position.tickUpper.tickIdx);
//   // let liquidity = BigInt(position.liquidity);
//   // let sqrtPriceX96 = BigInt(position.pool.sqrtPrice);
//   // let tick = Number(position.pool.tick);
//   // let decimal0 = position.token0.decimals;
//   // let decimal1 = position.token1.decimals;
//   // let token0DerivedUSD = position.token0.derivedUSD;
//   // let token1DerivedUSD = position.token1.derivedUSD;
//   // let token0AmountsInWei = PositionMath.getToken0Amount(tick, tickLow, tickHigh, sqrtPriceX96, liquidity);
//   // let token1AmountsInWei = PositionMath.getToken1Amount(tick, tickLow, tickHigh, sqrtPriceX96, liquidity);

//   // let token0DecimalValue = Number(token0AmountsInWei) / 10 ** decimal0;
//   // let token1DecimalValue = Number(token1AmountsInWei) / 10 ** decimal1;

//   // let token0UsdValue = BigNumber(token0AmountsInWei.toString()).multipliedBy(token0DerivedUSD).div(10 ** decimal0).toFixed(4);
//   // let token1UsdValue = BigNumber(token1AmountsInWei.toString()).multipliedBy(token1DerivedUSD).div(10 ** decimal1).toFixed(4);

//   // return [position.token0, position.token1,token0AmountsInWei, token1AmountsInWei, token0DecimalValue, token1DecimalValue,token0UsdValue, token1UsdValue,data.data._meta];
// };

export const getPoolDetailsFromSwap = (
  swaps: SwapCSVRow[]
): Map<string, PoolDetails> => {
  let result = new Map<string, PoolDetails>();
  for (let i = 0; i < swaps.length; i++) {
    let swap = swaps[i];
    let poolId = swap.poolId;
    let poolDetails = result.get(poolId);
    if (poolDetails === undefined) {
      poolDetails = {
        poolId: poolId,
        token0Address: swap.token0Address,
        token1Address: swap.token1Address,
        token0Symbol: swap.token0Symbol,
        token1Symbol: swap.token1Symbol,
        feeTier: swap.feeTier,
      };
      result.set(poolId, poolDetails);
    }
  }
  return result;
};

export const getUsersVolumeByUser = (
  swaps: SwapCSVRow[]
): Map<string, Map<string, UserAggregatedAssetsInPools>> => {
  let result = new Map<string, Map<string, UserAggregatedAssetsInPools>>();
  for (let i = 0; i < swaps.length; i++) {
    let swap = swaps[i];
    let poolId = swap.poolId;
    let owner = swap.sender;
    let userPositions = result.get(owner);
    if (userPositions === undefined) {
      userPositions = new Map<string, UserAggregatedAssetsInPools>();
      result.set(owner, userPositions);
    }
    let poolPositions = userPositions.get(poolId);
    if (poolPositions === undefined) {
      poolPositions = {
        volume: BigNumber(0),
        amountFeeUSD: BigNumber(0),
      };
    }
    // Total volume & feeUSD by poolId
    poolPositions.volume = poolPositions.volume.plus(
      BigNumber(swap.amountUSD.toString())
    );
    poolPositions.amountFeeUSD = poolPositions.amountFeeUSD.plus(
      BigNumber(swap.amountFeeUSD.toString())
    );
    userPositions.set(poolId, poolPositions);
  }
  return result;
};

export const getUsersVolumeByPoolId = (
  swaps: SwapCSVRow[]
): Map<string, Map<string, UserAggregatedAssetsInPools>> => {
  let result = new Map<string, Map<string, UserAggregatedAssetsInPools>>();
  for (let i = 0; i < swaps.length; i++) {
    let swap = swaps[i];
    let poolId = swap.poolId;
    let owner = swap.sender;
    let poolInfo = result.get(poolId);
    if (poolInfo === undefined) {
      poolInfo = new Map<string, UserAggregatedAssetsInPools>();
      result.set(poolId, poolInfo);
    }
    let userSwapInfo = poolInfo.get(owner);
    if (userSwapInfo === undefined) {
      userSwapInfo = {
        volume: BigNumber(0),
        amountFeeUSD: BigNumber(0),
      };
    }
    userSwapInfo.volume = userSwapInfo.volume.plus(
      BigNumber(swap.amountUSD.toString())
    );
    userSwapInfo.amountFeeUSD = userSwapInfo.amountFeeUSD.plus(
      BigNumber(swap.amountFeeUSD.toString())
    );
    poolInfo.set(owner, userSwapInfo);
  }
  return result;
};

export const getNumberOfPositionsByUserAndPoolFromPositions = (
  positions: Swap[]
): Map<string, Map<string, Number>> => {
  let result = new Map<string, Map<string, Number>>();
  for (let i = 0; i < positions.length; i++) {
    let position = positions[i];
    let poolId = position.pool.id;
    let sender = position.sender;
    let userPositions = result.get(sender);
    if (userPositions === undefined) {
      userPositions = new Map<string, Number>();
      result.set(sender, userPositions);
    }
    let poolPositions = userPositions.get(poolId);
    if (poolPositions === undefined) {
      poolPositions = 0;
    }
    poolPositions = Number(poolPositions) + 1;
    userPositions.set(poolId, poolPositions);
  }
  return result;
};

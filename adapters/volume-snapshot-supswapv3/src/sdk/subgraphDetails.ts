import BigNumber from "bignumber.js";
import { AMM_TYPES, CHAINS, PROTOCOLS, SUBGRAPH_URLS } from "./config";
import { PositionMath } from "./utils/positionMath";

export interface UserAggregatedAssetsInPools {
  volume: BigNumber;
}
export interface PoolDetails {
  token0: TokenDetails;
  token1: TokenDetails;
  feeTier: number;
}

export interface TokenDetails {
  id: string;
  decimals: number;
  name: string;
  symbol: string;
  derivedUSD?: number;
}

export interface Swap {
  id: string;
  amount0: bigint;
  amount1: bigint;
  amountUSD: bigint;
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

export const getSwapsForAddressByPoolAtBlock = async (
  fromBlock: number,
  startTimestamp: number,
  endTimestamp: number,
  address: string,
  poolIds: string[],
  chainId: CHAINS,
  protocol: PROTOCOLS,
  ammType: AMM_TYPES
): Promise<Swap[]> => {
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

  let skip = 0;
  let fetchNext = true;
  let result: Swap[] = [];
  while (fetchNext) {
    let query = `{
            swaps(${whereQuery} ${blockQuery} orderBy: transaction__timestamp, first:1000,skip:${skip}) {
              id
              sender
              amount0
              amount1
              amountUSD
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

    let response = await fetch(subgraphUrl, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: { "Content-Type": "application/json" },
    });

    let data = await response.json();

    let swapList = data.data.swaps;
    for (let i = 0; i < swapList.length; i++) {
      let swap = swapList[i];
      let transformedPosition: Swap = {
        id: swap.id,
        amount0: swap.amount0,
        amount1: swap.amount1,
        amountUSD: swap.amountUSD,
        sender: swap.sender,
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
    if (swapList.length < 1000) {
      fetchNext = false;
    } else {
      skip += 1000;
    }
    console.log("Round:", result.length / 1000, "Swap data:", result.length);
  }
  return result;
};

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
  positions: Swap[]
): Map<string, PoolDetails> => {
  let result = new Map<string, PoolDetails>();
  for (let i = 0; i < positions.length; i++) {
    let position = positions[i];
    let poolId = position.pool.id;
    let poolDetails = result.get(poolId);
    if (poolDetails === undefined) {
      poolDetails = {
        token0: position.token0,
        token1: position.token1,
        feeTier: position.pool.feeTier,
      };
      result.set(poolId, poolDetails);
    }
  }
  return result;
};

// export const getPositionDetailsFromPosition = (
//   position: Swap
// ): PositionWithUSDValue => {
//   let tickLow = position.tickLower.tickIdx;
//   let tickHigh = position.tickUpper.tickIdx;
//   let amount0 = position.amount0;
//   let sqrtPriceX96 = position.pool.sqrtPrice;
//   let tick = Number(position.pool.tick);
//   let decimal0 = position.token0.decimals;
//   let decimal1 = position.token1.decimals;
//   let token0DerivedUSD = position.token0.derivedUSD;
//   let token1DerivedUSD = position.token1.derivedUSD;
//   let token0AmountsInWei = PositionMath.getToken0Amount(
//     tick,
//     tickLow,
//     tickHigh,
//     sqrtPriceX96,
//     liquidity
//   );
//   let token1AmountsInWei = PositionMath.getToken1Amount(
//     tick,
//     tickLow,
//     tickHigh,
//     sqrtPriceX96,
//     liquidity
//   );

//   let token0DecimalValue = Number(token0AmountsInWei) / 10 ** decimal0;
//   let token1DecimalValue = Number(token1AmountsInWei) / 10 ** decimal1;

//   let token0UsdValue = BigNumber(token0AmountsInWei.toString())
//     .multipliedBy(token0DerivedUSD)
//     .div(10 ** decimal0)
//     .toFixed(4);
//   let token1UsdValue = BigNumber(token1AmountsInWei.toString())
//     .multipliedBy(token1DerivedUSD)
//     .div(10 ** decimal1)
//     .toFixed(4);

//   let feeTier = position.pool.feeTier;
//   return {
//     ...position,
//     token0USDValue: token0UsdValue,
//     token1USDValue: token1UsdValue,
//     token0AmountsInWei,
//     token1AmountsInWei,
//     token0DecimalValue,
//     token1DecimalValue,
//     feeTier,
//     token0Symbol: position.token0.symbol,
//     token1Symbol: position.token1.symbol,
//   };
// };

export const getUsersVolumeByUser = (
  swaps: Swap[]
): Map<string, Map<string, UserAggregatedAssetsInPools>> => {
  let result = new Map<string, Map<string, UserAggregatedAssetsInPools>>();
  for (let i = 0; i < swaps.length; i++) {
    let swap = swaps[i];
    let poolId = swap.pool.id;
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
      };
    }
    poolPositions.volume = poolPositions.volume.plus(
      BigNumber(swap.amountUSD.toString())
    );
    userPositions.set(poolId, poolPositions);
  }
  return result;
};

export const getUsersVolumeByPoolId = (
  swaps: Swap[]
): Map<string, Map<string, UserAggregatedAssetsInPools>> => {
  let result = new Map<string, Map<string, UserAggregatedAssetsInPools>>();
  for (let i = 0; i < swaps.length; i++) {
    let swap = swaps[i];
    let poolId = swap.pool.id;
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
      };
    }
    userSwapInfo.volume = userSwapInfo.volume.plus(
      BigNumber(swap.amountUSD.toString())
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

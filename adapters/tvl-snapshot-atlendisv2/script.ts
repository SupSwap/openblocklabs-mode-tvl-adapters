import fs from "fs";
import csv from "csv-parser";
import path from "path";
import { write } from "fast-csv";
import axios from "axios";
import { ethers } from "ethers";

const ATLENDIS_API_URL = "https://atlendis.herokuapp.com/graphql";
const MODE_NETWORK_CHAIN_ID = 34443;
const MODE_NETWORK_URL = "https://mainnet.mode.network/";
const QUERY_FIRST = 100;

type CSVRow = {
  user: string;
  pool: string;
  poolAddress: string;
  block: number;
  lpvalue: number;
};

const readBlocksFromCSV = async (filePath: string): Promise<number[]> => {
  return new Promise((resolve, reject) => {
    const blocks: number[] = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        for (let key in row) {
          const blockNumber = parseInt(row[key]);
          if (!isNaN(blockNumber)) {
            // Ensure it's a valid number before pushing
            blocks.push(blockNumber);
          }
        }
      })
      .on("end", () => {
        console.log("CSV file successfully processed.");
        resolve(blocks); // Resolve the promise with the blocks array
      })
      .on("error", (error) => {
        reject(error); // Reject the promise if an error occurs
      });
  });
};

async function mapBlockNumberToBlockTimestamp(
  blocks: number[]
): Promise<Map<number, number>> {
  const modeJsonRcpProvider = new ethers.JsonRpcProvider(MODE_NETWORK_URL);
  const mappedBlocks = new Map<number, number>();
  for (const blockNumber of blocks) {
    const block = await modeJsonRcpProvider.getBlock(blockNumber);
    if (!block)
      throw new Error(`Unable to retrieve block for : ${blockNumber}`);
    mappedBlocks.set(blockNumber, block.timestamp);
  }
  return mappedBlocks;
}

type Rcl = { address: string; instanceId: string };

const rclsQuery = `query RclsOnMode($chainId: Int!){
  rcls(chainId: $chainId){
    address
    instanceId
  }
}`;

async function getPoolsOnMode(): Promise<Rcl[]> {
  try {
    const response = await axios.post(ATLENDIS_API_URL, {
      query: rclsQuery,
      variables: {
        chainId: MODE_NETWORK_CHAIN_ID,
      },
    });
    const {
      data: { rcls },
    } = response.data as { data: { rcls: Rcl[] } };
    return rcls;
  } catch (err) {
    console.log((err as Error).stack);
    throw new Error("Something went wrong");
  }
}

function mapPoolsInstanceIdToAddress(pools: Rcl[]): Map<string, string> {
  const poolsMap = new Map<string, string>();
  for (const pool of pools) {
    poolsMap.set(pool.instanceId, pool.address);
  }
  return poolsMap;
}

type ActionPayload =
  | { type: "deposit"; depositAmount: string }
  | {
      type: "partialWithdrawal" | "withdrawal";
      receivedAmount: string;
      fees: string;
    };

type PositionHistory = {
  blockNumber: number;
  positionId: string;
  lender: string;
  metadata: {
    instanceId: string;
  };
  instanceToken: {
    symbol: string;
    decimals: number;
    usdValue: number;
  };
  depositAmount: string;
  payload: ActionPayload;
}[];

const positionHistoryQuery = `query LenderPositionHistoryOnMode($chainId: Int!, $end: Int!, $first: Int!, $skip: Int!) {
  positionHistory(
    where: {
      chainId: $chainId
      blockTimestamp_lte: $end
      type_in: [deposit, partialWithdrawal, withdrawal]
    }, 
    first: $first, 
    skip: $skip
  ) {
    blockNumber
    positionId
    lender
    metadata {
      instanceId
    }
    instanceToken {
      symbol 
      decimals 
      usdValue
    }
    depositAmount
    payload {
      ... on DepositPositionHistoryItemPayload {
        type
      }
      ... on WithdrawalPositionHistoryItemPayload {
        type
        receivedAmount
        fees
      }
    }
  }
}`;

async function getUsersPositionHistoryInModePools(
  timestamp: number,
  first: number,
  skip: number
): Promise<{
  positionHistory: PositionHistory;
  isDataFullyQueried: boolean;
}> {
  try {
    const response = await axios.post(ATLENDIS_API_URL, {
      query: positionHistoryQuery,
      variables: {
        chainId: MODE_NETWORK_CHAIN_ID,
        end: timestamp,
        first: first + 1,
        skip,
      },
    });
    const {
      data: { positionHistory },
    } = response.data as { data: { positionHistory: PositionHistory } };
    return {
      positionHistory,
      isDataFullyQueried: positionHistory.length <= first,
    };
  } catch (err) {
    console.log((err as Error).stack);
    throw new Error("Something went wrong");
  }
}

async function fetchData(blockTimestamp: number): Promise<PositionHistory> {
  let skip = 0;
  let usersPositionHistoryInModePools: PositionHistory = [];
  const data = await getUsersPositionHistoryInModePools(
    blockTimestamp,
    QUERY_FIRST,
    skip
  );
  let isQueryingProcessOver = data.isDataFullyQueried;
  if (isQueryingProcessOver) {
    return data.positionHistory;
  } else {
    while (!isQueryingProcessOver) {
      skip = skip + QUERY_FIRST;
      const data = await getUsersPositionHistoryInModePools(
        blockTimestamp,
        QUERY_FIRST,
        skip
      );
      usersPositionHistoryInModePools = usersPositionHistoryInModePools.concat(
        data.positionHistory
      );
      isQueryingProcessOver = data.isDataFullyQueried;
    }
    return usersPositionHistoryInModePools;
  }
}

function computeBalanceFromAction(
  depositAmount: string,
  payload: ActionPayload
): bigint {
  if (payload.type === "deposit") {
    return BigInt(depositAmount);
  }
  return (
    BigInt(depositAmount) -
    BigInt(payload.receivedAmount) -
    BigInt(payload.fees)
  );
}

type UserBalances = Record<
  string,
  {
    [pool: string]: {
      [positionBalance: string]: {
        value: bigint;
        token: { symbol: string; decimals: number; usdValue: number };
      };
    };
  }
>;

function mapUsersBalances(
  targetedBlock: number,
  history: PositionHistory
): UserBalances {
  const userBalancesMap: UserBalances = {};
  for (const action of history) {
    if (action.blockNumber > targetedBlock) continue;
    const user = action.lender;
    const pool = action.metadata.instanceId;
    const position = action.positionId;
    if (!userBalancesMap[user]) {
      userBalancesMap[user] = {
        [pool]: {
          [position]: {
            value: computeBalanceFromAction(
              action.depositAmount,
              action.payload
            ),
            token: action.instanceToken,
          },
        },
      };
    } else {
      if (!userBalancesMap[user][pool]) {
        userBalancesMap[user][pool][position] = {
          value: computeBalanceFromAction(action.depositAmount, action.payload),
          token: action.instanceToken,
        };
      } else {
        if (!userBalancesMap[user][pool][position]) {
          userBalancesMap[user][pool][position] = {
            value: computeBalanceFromAction(
              action.depositAmount,
              action.payload
            ),
            token: action.instanceToken,
          };
        }
      }
    }
  }
  return userBalancesMap;
}

function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function aggregateBalancesPerUserPerPoolInUsd(
  balances: UserBalances
): Record<string, Record<string, number>> {
  const aggregatedBalances: Record<string, Record<string, number>> = {};
  
  for (const userAddress in balances) {
    const aggregatedBalancePerPoolInUsd = Object.entries(
      balances[userAddress]
    ).reduce((userPoolBalances: Record<string, number>, [pool, balances]) => {
      const poolBalance = Object.values(balances).reduce(
        (acc: bigint, positionBalance) => {
          const {
            value,
            token: { usdValue, decimals },
          } = positionBalance;
          const decimalBigInt = ethers.parseUnits("1", decimals);
          const roundedUsdValue = roundToDecimals(usdValue, decimals);
          const fxRateBigInt = ethers.parseUnits(String(roundedUsdValue), decimals);
          return acc + (value * fxRateBigInt) / decimalBigInt / decimalBigInt;
        },
        BigInt(0)
      );
      return { ...userPoolBalances, [pool]: Number(poolBalance) };
    }, {});
    aggregatedBalances[userAddress] = aggregatedBalancePerPoolInUsd;
  }
  return aggregatedBalances;
}

async function run() {
  const csvFilePath = path.resolve(
    __dirname,
    "../../../data/mode_atlendisv2_hourly_blocks.csv"
  );

  const snapshotBlocks = await readBlocksFromCSV(csvFilePath);
  const blockNumberToBlockTimestampMap =
    await mapBlockNumberToBlockTimestamp(snapshotBlocks);
  const latestBlockTimestamp = blockNumberToBlockTimestampMap.get(
    snapshotBlocks[snapshotBlocks.length - 1]
  );
  if (!latestBlockTimestamp) {
    throw new Error("Failed to retrieve last blocktimestamp");
  }

  const pools = await getPoolsOnMode();
  const poolsInstanceIdToAddressMap = mapPoolsInstanceIdToAddress(pools);
  const data = await fetchData(latestBlockTimestamp);
  const csvRows: CSVRow[] = [];

  for (let block of snapshotBlocks) {
    const balances = mapUsersBalances(block, data);
    const aggBalances = aggregateBalancesPerUserPerPoolInUsd(balances);
    const csvRowsForBlock: CSVRow[] = Object.entries(aggBalances).reduce(
      (acc: CSVRow[], [user, balancePerPool]) => {
        const userRows: CSVRow[] = Object.entries(balancePerPool).map(
          ([pool, lpvalue]) => {
            const poolAddress = poolsInstanceIdToAddressMap.get(pool);
            if (!poolAddress) throw new Error("No such pool");
            return {
              user,
              pool,
              poolAddress,
              block,
              lpvalue,
            };
          }
        );
        return [...acc, ...userRows];
      },
      []
    );
    csvRows.push(...csvRowsForBlock);
  }

  const outputPath = path.resolve(
    __dirname,
    "../../../data/mode_atlendisv2_tvl_snapshot.csv"
  );
  const ws = fs.createWriteStream(outputPath);
  write(csvRows, { headers: true })
    .pipe(ws)
    .on("finish", () => {
      console.log("CSV file has been written.");
    });
}

run();

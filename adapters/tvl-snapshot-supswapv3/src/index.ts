import { CHAINS, PROTOCOLS, AMM_TYPES } from "./sdk/config";
import { getLPValueByUserAndPoolFromPositions, getPositionAtBlock, 
  getPositionDetailsFromPosition, 
  getPositionsForAddressByPoolAtBlock, getPoolDetailsFromPositions,
  getNumberOfPositionsByUserAndPoolFromPositions, 
  getPoolsInformationFromSubgraph} from "./sdk/subgraphDetails";
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import csv from "csv-parser";
import fs from "fs";
import { write } from "fast-csv";
import path from "path";
import { readUserPositionTVLFromCSV } from "./commons/csv-utils";
import { logWithTimestamp } from "./commons/log-utils";
import { createTable, storeData, updatePoolInformationInDb, storeDataWithCopyStream } from "./db/dbutils";
import { tokensFromGitUrl } from "./commons/json-utils";

//Uncomment the following lines to test the getPositionAtBlock function

// const position = getPositionAtBlock(
//         0, // block number 0 for latest block
//         2, // position id
//         CHAINS.MODE, // chain id
//         PROTOCOLS.SUPSWAP, // protocol
//         AMM_TYPES.UNISWAPV3 // amm type
//     );
// position.then((position) => {
//     // print response
//     const result = getPositionDetailsFromPosition(position);
//     logWithTimestamp(`${JSON.stringify(result,null, 4)}
//     `)
// });

interface LPValueDetails {
  pool: string;
  lpValue: string;
}

interface UserLPData {
  totalLP: string;
  pools: LPValueDetails[];
}

// Define an object type that can be indexed with string keys, where each key points to a UserLPData object
interface OutputData {
  [key: string]: UserLPData;
}

interface CSVRow {
  user: string;
  pool: string;
  block: number;
  position: number;
  lpvalue: string;
  pairName: string;
  userPoolPositions: number;
  token0Amount: string;
  token1Amount: string;
}

const prepareBlockNumbersArr = (
  startBlockNumber: number,
  interval: number,
  endBlockNumber: number
) => {
  const blockNumbers = [];
  let currentBlockNumber = startBlockNumber;
  do {
    blockNumbers.push(currentBlockNumber);
    currentBlockNumber += interval;
  } while (currentBlockNumber <= endBlockNumber);

  return blockNumbers;
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
        logWithTimestamp("CSV file successfully processed.");
        resolve(blocks); // Resolve the promise with the blocks array
      })
      .on("error", (error) => {
        reject(error); // Reject the promise if an error occurs
      });
  });
};

// 7383401
const getData = async () => {
  // const csvFilePath = path.resolve(
  //   __dirname,
  //   "../../../../data/mode_supswapv3_hourly_blocks.csv"
  // );
  // const snapshotBlocks = await readBlocksFromCSV(csvFilePath);
  const snapshotBlocks = prepareBlockNumbersArr(3245809, 43200, 3332209);
  logWithTimestamp("Total blocks: " + snapshotBlocks.length);

  // Write the CSV output to a file
  //const outputPath = path.resolve(__dirname, '../../../../data/mode_supswapv3_tvl_snapshot.csv');

  const outputPath = path.resolve(
    __dirname,
    "../mode_supswapv3_tvl_snapshot.csv"
  );
  // logWithTimestamp(outputPath)
  const userPoolTVLs: UserPoolTVL[] = [];
  let processingIndex = 0;
  for (let block of snapshotBlocks) {
    const positions = await getPositionsForAddressByPoolAtBlock(
      block,
      "",
      "",
      CHAINS.MODE,
      PROTOCOLS.SUPSWAP,
      AMM_TYPES.UNISWAPV3
    );

    logWithTimestamp(`Block: ${block}`);
    logWithTimestamp(`Positions:  ${positions.length}`);

    let poolInfo = getPoolDetailsFromPositions(positions);

    // Assuming this part of the logic remains the same
    let positionsWithUSDValue = positions.map(getPositionDetailsFromPosition);
    let lpValueByUsers = getLPValueByUserAndPoolFromPositions(
      positionsWithUSDValue
    );
    let numberOfPositionsByUsersAndPool =
      getNumberOfPositionsByUserAndPoolFromPositions(positionsWithUSDValue);
    let uniqueUsersCount = 0;

    lpValueByUsers.forEach((value, key) => {
      uniqueUsersCount++;
      let positionIndex = 0; // Define how you track position index
      value.forEach((userAggregatedAssetsInPools, poolKey) => {
        const poolDetails = poolInfo.get(poolKey)!!;
        // Accumulate CSV row data
        userPoolTVLs.push({
          user: key,
          pairName: `${poolDetails.token0.symbol}/${
            poolDetails.token1.symbol
          } ${poolDetails.feeTier / 10000}%`,
          pool: poolKey,
          block,
          position: positions.length, // Adjust if you have a specific way to identify positions
          lpvalue: userAggregatedAssetsInPools.lpValue.toString(),
          userPoolPositions: Number(
            numberOfPositionsByUsersAndPool.get(key)?.get(poolKey) ?? 0
          ),
          token0Amount:
            userAggregatedAssetsInPools.token0AmountInDecimal.toString(),
          token1Amount:
            userAggregatedAssetsInPools.token1AmountInDecimal.toString(),
        });
      });
    });

    logWithTimestamp("Number of Users:" + uniqueUsersCount);
  }
  const ws = fs.createWriteStream(outputPath, { flags: "a" });
  write(userPoolTVLs, { headers: true })
    .pipe(ws)
    .on("finish", () => {
      logWithTimestamp("CSV file has been written.");
    });
};
logWithTimestamp("Starting...");
getData().then(() => {
  logWithTimestamp("Done");
});

// tokensFromGitUrl("https://raw.githubusercontent.com/SupSwap/tokens/main/list/tokens.json").then((tokens) => {
//   logWithTimestamp(`Tokens: ${tokens}`);
// });


// getPrice(new BigNumber('1579427897588720602142863095414958'), 6, 18); //Uniswap
// getPrice(new BigNumber('3968729022398277600000000'), 18, 6); //SupSwap

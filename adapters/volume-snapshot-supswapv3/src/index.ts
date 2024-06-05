import csv from "csv-parser";
import { write } from "fast-csv";
import fs from "fs";
import path from "path";
import { AMM_TYPES, CHAINS, PROTOCOLS } from "./sdk/config";
import {
  getUsersVolumeByUser,
  getPoolDetailsFromSwap,
  getSwapsForAddressByPoolAtBlock,
  getUsersVolumeByPoolId,
} from "./sdk/subgraphDetails";
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

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
  // block: number;
  // position: number;
  volume: string;
  pairName: string;
  startTimestamp?: number;
  endTimestamp?: number;
  // userPoolPositions: number;
  // token0Amount: string;
  // token1Amount: string;
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

  // Write the CSV output to a file
  //const outputPath = path.resolve(__dirname, '../../../../data/mode_supswapv3_tvl_snapshot.csv');

  const fromBlock = 0;
  const startTimestamp = 1706290937; // Friday, January 26, 2024 5:42:17 PM
  const endTimestamp = 1717545600; // Wednesday, June 5, 2024 12:00:00 AM
  const outputPath = path.resolve(
    __dirname,
    "../mode_supswapv3_volume_snapshot.csv"
  );
  const outputPath2 = path.resolve(
    __dirname,
    "../mode_supswapv3_volume_snapshot2.csv"
  );
  // logWithTimestamp(outputPath)
  const csvRows: CSVRow[] = [];
  const csvRows2: CSVRow[] = [];
  const swapList = await getSwapsForAddressByPoolAtBlock(
    fromBlock,
    startTimestamp,
    endTimestamp,
    "",
    [
      `[
      "0x1c5dac653e349bda91d453d5751f167489e02ac9",
      "0x7a55c67aaf235cc6620f207a7da74438aac0b58e",
      "0x5fd1fdf90276957154cd2985936acf4fcbf74b4c",
      "0xf2e9c024f1c0b7a2a4ea11243c2d86a7b38dd72f",
      "0x962e5982c1507af4ea5af2d6a25774f6e93b50d4",
      "0xd87f0dd632cce09e3f78919c4399f4676bdaab9d",
      "0xb711ab77d504aadaade1a66b59097da6dae4d828",
      "0x17298f6e971921e7c2a03bd2f3140c883fee47d2",
      "0x5af5c0d446468a55efcf26d8e1d291b175751645",
      "0xf9cd7bf85dbbf20d786068dd17210b471cf10f69",
    ]`,
    ],
    CHAINS.MODE,
    PROTOCOLS.SUPSWAP,
    AMM_TYPES.UNISWAPV3
  );

  logWithTimestamp(`Block from: ${fromBlock}`);
  logWithTimestamp(`Timestamp start: ${startTimestamp}  end:${endTimestamp}`);
  logWithTimestamp(`Total swaps:  ${swapList.length}`);

  let poolInfo = getPoolDetailsFromSwap(swapList);

  // Assuming this part of the logic remains the same
  // let positionsWithUSDValue = swapList.map(getPositionDetailsFromPosition);
  let swapVolumeByUsers = getUsersVolumeByUser(swapList);
  let swapVolumeByPool = getUsersVolumeByPoolId(swapList);

  // let numberOfPositionsByUsersAndPool =
  //   getNumberOfPositionsByUserAndPoolFromPositions(positionsWithUSDValue);
  let uniqueUsersCount = 0;

  swapVolumeByUsers.forEach((value, key) => {
    uniqueUsersCount++;
    let positionIndex = 0; // Define how you track position index
    value.forEach((userAggregatedAssetsInPools, poolKey) => {
      const poolDetails = poolInfo.get(poolKey)!!;
      // Accumulate CSV row data
      csvRows.push({
        user: key,
        pairName: `${poolDetails.token0.symbol}/${poolDetails.token1.symbol} ${
          poolDetails.feeTier / 10000
        }%`,
        pool: poolKey,
        // timestamp,
        // position: swapList.length, // Adjust if you have a specific way to identify positions
        volume: userAggregatedAssetsInPools.volume.toFixed(4),
        // userPoolPositions: Number(
        //   numberOfPositionsByUsersAndPool.get(key)?.get(poolKey) ?? 0
        // ),
        // token0Amount:
        //   userAggregatedAssetsInPools.token0AmountInDecimal.toString(),
        // token1Amount:
        //   userAggregatedAssetsInPools.token1AmountInDecimal.toString(),
      });
    });
  });

  swapVolumeByPool.forEach((value, poolKey) => {
    uniqueUsersCount++;
    let positionIndex = 0; // Define how you track position index
    const poolDetails = poolInfo.get(poolKey)!!;
    value.forEach((userAggregatedAssetsInPools, userKey) => {
      // Accumulate CSV row data
      csvRows2.push({
        user: userKey,
        pairName: `${poolDetails.token0.symbol}/${poolDetails.token1.symbol} ${
          poolDetails.feeTier / 10000
        }%`,
        pool: poolKey,
        // position: swapList.length, // Adjust if you have a specific way to identify positions
        volume: userAggregatedAssetsInPools.volume.toFixed(4),
        startTimestamp,
        endTimestamp,
        // userPoolPositions: Number(
        //   numberOfPositionsByUsersAndPool.get(key)?.get(poolKey) ?? 0
        // ),
        // token0Amount:
        //   userAggregatedAssetsInPools.token0AmountInDecimal.toString(),
        // token1Amount:
        //   userAggregatedAssetsInPools.token1AmountInDecimal.toString(),
      });
    });
  });

  logWithTimestamp("Number of Users:" + uniqueUsersCount);

  const ws = fs.createWriteStream(outputPath, { flags: "a" });
  write(csvRows, { headers: true })
    .pipe(ws)
    .on("finish", () => {
      logWithTimestamp("CSV file has been written.");
    });
  const ws2 = fs.createWriteStream(outputPath2, { flags: "a" });
  write(csvRows2, { headers: true })
    .pipe(ws2)
    .on("finish", () => {
      logWithTimestamp("CSV2 file has been written.");
    });
};
logWithTimestamp("Starting...");
getData().then(() => {
  logWithTimestamp("Done");
});
function logWithTimestamp(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}](${Date.now()})  ${message}`);
}
// getPrice(new BigNumber('1579427897588720602142863095414958'), 6, 18); //Uniswap
// getPrice(new BigNumber('3968729022398277600000000'), 18, 6); //SupSwap

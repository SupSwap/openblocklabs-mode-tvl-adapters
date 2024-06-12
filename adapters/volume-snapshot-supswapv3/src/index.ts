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
  Swap,
  SwapCSVRow,
} from "./sdk/subgraphDetails";
import { logWithTimestamp } from "./commons/log-utils";
import { readCSVWithPromise } from "./sdk/utils/csvReadWriteWithPromise";
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

interface CSVRow {
  user: string;
  pool: string;
  feeUSD: string;
  volume: string;
  pairName: string;
  token0Address: string;
  token1Address: string;
  startTimestamp?: number;
  endTimestamp?: number;
}

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
  // logWithTimestamp(outputPath)
  const csvRows: CSVRow[] = [];
  const csvRows2: CSVRow[] = [];

  // read input.csv as standard text file which reads line by line and store data in input variable
  let inputFilePathForIndices = path.resolve(__dirname, "../input.csv");

  // read input.csv as standard text file which reads line by line and store data in input variable
  let input = fs.readFileSync(inputFilePathForIndices, "utf8");
  let inputArray = input.split("\n");
  // user the first element and split it with , and store it in initialRequestIndices
  let initialRequestIndices = inputArray[0].split(",").map((index) => {
    return { index: parseInt(index), pending: true };
  });
  let batchSize = initialRequestIndices.length;
  let dataSize = parseInt(inputArray[1]);

  let prePopulatedData = await prePopulateDataFromCSV(
    "../pre_mode_supswapv3_volume_snapshot.csv"
  );

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
    AMM_TYPES.UNISWAPV3,
    initialRequestIndices,
    batchSize,
    dataSize,
    prePopulatedData
  );

  logWithTimestamp(`Block from: ${fromBlock}`);
  logWithTimestamp(`Timestamp start: ${startTimestamp}  end:${endTimestamp}`);
  logWithTimestamp(`Total swaps:  ${swapList.length}`);

  let poolInfo = getPoolDetailsFromSwap(swapList);

  // Assuming this part of the logic remains the same
  let swapVolumeByUsers = getUsersVolumeByUser(swapList);
  // let swapVolumeByPool = getUsersVolumeByPoolId(swapList);

  let uniqueUsersCount = 0;

  swapVolumeByUsers.forEach((value, key) => {
    uniqueUsersCount++;
    value.forEach((userAggregatedAssetsInPools, poolKey) => {
      const poolDetails = poolInfo.get(poolKey)!!;
      // Accumulate CSV row data
      csvRows.push({
        user: key,
        pairName: `${poolDetails.token0Symbol}/${poolDetails.token1Symbol} ${
          poolDetails.feeTier / 10000
        }%`,
        pool: poolKey,
        feeUSD: userAggregatedAssetsInPools.amountFeeUSD.toFixed(4),
        volume: userAggregatedAssetsInPools.volume.toFixed(4),
        token0Address: poolDetails.token0Address,
        token1Address: poolDetails.token1Address,
        startTimestamp,
        endTimestamp,
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
};

async function prePopulateDataFromCSV(arg0: string): Promise<SwapCSVRow[]> {
  // check if file exists or else create it
  if (!fs.existsSync(path.resolve(__dirname, arg0))) {
    fs.writeFileSync(path.resolve(__dirname, arg0), "");
    return [];
  }

  // let csv = fs.readFileSync(path.resolve(__dirname, arg0), "utf8");

  let csvArray = await readCSVWithPromise(path.resolve(__dirname, arg0));
  let swaps: SwapCSVRow[] = [];
  csvArray.forEach((row) => {
    let swap = row.split(",");
    swaps.push({
      timestamp: parseInt(swap[0]),
      id: swap[1],
      amount0: Number(swap[2]),
      amount1: Number(swap[3]),
      amountUSD: Number(swap[4]),
      amountFeeUSD: Number(swap[5]),
      sender: swap[6],
      poolId: swap[7],
      token0Symbol: swap[8],
      token1Symbol: swap[9],
      token0Address: swap[10],
      token1Address: swap[11],
      sqrtPrice: Number(swap[12]),
      tick: parseInt(swap[13]),
      feeTier: parseInt(swap[14]),
    });
  });
  return swaps;
}
// getPrice(new BigNumber('1579427897588720602142863095414958'), 6, 18); //Uniswap
// getPrice(new BigNumber('3968729022398277600000000'), 18, 6); //SupSwap


logWithTimestamp("Starting...");
getData().then(() => {
  logWithTimestamp("Done");
});

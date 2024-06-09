import { CHAINS, PROTOCOLS } from "./sdk/config";
import { getClosesBeforeBlock, getLPValueByUser, getOpensBeforeBlock } from "./sdk/subgraphDetails";
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import csv from 'csv-parser';
import fs from 'fs';
import { write } from 'fast-csv';
import path from "path";

interface CSVRow {
  user: string;
  token_address: string;
  block: number;
  token_balance: string;
}

// Goldsky rate limit of 50 requests per 10 seconds (= 5 per second = 200ms delay. Using buffer with 300ms)
const sleepWaitPromise = (milliseconds = 100, log = true) => {
  if (log) {
    console.log(`sleepWaitPromise: waiting delay of ${milliseconds} ms...`);
  }

  return new Promise((res) => setTimeout(() => res(null), milliseconds));
}

const readBlocksFromCSV = async (filePath: string): Promise<number[]> => {
  return new Promise((resolve, reject) => {
    const blocks: number[] = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        for (let key in row) {
          const blockNumber = parseInt(row[key]);
          if (!isNaN(blockNumber)) { // Ensure it's a valid number before pushing
            blocks.push(blockNumber);
          }
        }
      })
      .on('end', () => {
        console.log('CSV file successfully processed.');
        resolve(blocks); // Resolve the promise with the blocks array
      })
      .on('error', (error) => {
        reject(error); // Reject the promise if an error occurs
      });
  });
};


const getData = async () => {
  const csvFilePath = path.resolve(__dirname, '../../../../data/mode_astaria_hourly_blocks.csv');
  const snapshotBlocks = await readBlocksFromCSV(csvFilePath);

  const csvRows: CSVRow[] = [];

  for (let block of snapshotBlocks) {
    const opens = await getOpensBeforeBlock(
      block, CHAINS.MODE, PROTOCOLS.ASTARIA
    );
    const closes = await getClosesBeforeBlock(
      block, CHAINS.MODE, PROTOCOLS.ASTARIA
    );
    const lpValueByUsers = getLPValueByUser(opens, closes);

    lpValueByUsers.forEach((value, key) => {
      value.forEach((lpValue, lpToken) => {
        const lpValueStr = lpValue;
        // Accumulate CSV row data
        csvRows.push({
          user: key,
          token_address: lpToken,
          block,
          token_balance: lpValueStr.toFixed(0),
        });
      });
    });
    await sleepWaitPromise(500);
  }

  // Write the CSV output to a file
  const outputPath = path.resolve(__dirname, '../../../../data/mode_astaria_tvl_snapshot.csv');
  const ws = fs.createWriteStream(outputPath);
  write(csvRows, { headers: true }).pipe(ws).on('finish', () => {
    console.log("CSV file has been written.");
  });
};

getData().then(() => {
  console.log("Done");
});
import * as path from "path";
import { CHAINS, PROTOCOLS, AMM_TYPES } from "./sdk/config";
import { getLPValueByUserAndPoolFromPositions, getPositionAtBlock, getPositionDetailsFromPosition, getPositionsForAddressByPoolAtBlock } from "./sdk/subgraphDetails";
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import csv from 'csv-parser';
import fs from 'fs';

const { ParquetWriter, ParquetSchema } = require('parquetjs-lite');

//Uncomment the following lines to test the getPositionAtBlock function

// const position = getPositionAtBlock(
//         0, // block number 0 for latest block
//         2, // position id
//         CHAINS.MODE, // chain id
//         PROTOCOLS.KIM, // protocol
//         AMM_TYPES.KIM // amm type
//     );
// position.then((position) => {
//     // print response
//     const result = getPositionDetailsFromPosition(position);
//     console.log(`${JSON.stringify(result,null, 4)}
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

// Define the schema for the Parquet file
const schema = new ParquetSchema({
  user: { type: 'UTF8' },
  pool: { type: 'UTF8' },
  block: { type: 'INT64' },
  position: { type: 'INT32' },
  lpvalue: { type: 'FLOAT' },
});

interface CSVRow {
  user: string;
  pool: string;
  block: number;
  position: number;
  lpvalue: string;
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

const prepareBlockNumbersArr = (startBlockNumber: number, interval: number, endBlockNumber: number) => {
  const blockNumbers = [];
  let currentBlockNumber = startBlockNumber;
  do{
      blockNumbers.push(currentBlockNumber);
      currentBlockNumber += interval;
  }while(currentBlockNumber <= endBlockNumber);
  
  return blockNumbers;
}
const getData = async () => {
  // const csvFilePath = path.resolve(__dirname, '../../../../data/mode_supswapv4_hourly_blocks.csv');
  // const snapshotBlocks = await readBlocksFromCSV(csvFilePath);
  const snapshotBlocks = prepareBlockNumbersArr(7289742,43200,	
    8271376)
    logWithTimestamp("Total blocks: "+snapshotBlocks.length)
    
    // Write the CSV output to a file
  // const outputPath = path.resolve(__dirname, '../../../../data/mode_supswapv4_tvl_snapshot.parquet');
  
  const outputPath = path.resolve(__dirname, '../mode_supswapv4_tvl_snapshot.csv');
  // logWithTimestamp(outputPath)
  const csvRows: CSVRow[] = [];

  for (let block of snapshotBlocks) {
    let pairTokenList = `
      [
        "0x4200000000000000000000000000000000000006",
        "0xd988097fb8612cc24eec14542bc03424c656005f",
        "0xf0f161fda2712db8b566946122a5af183995e2ed",
        "0xcdd475325d6f564d27247d1dddbb0dac6fa0a5cf",
        "0x3e7ef8f50246f725885102e8238cbba33f276747",
        "0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3",
        "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
        "0xe7798f023fc62146e8aa1b36da45fb70855a77ea",
        "0xd08a2917653d4e460893203471f0000826fb4034",
        "0x7c6b91d9be155a6db01f749217d76ff02a7227f2",
        "0x12d8ce035c5de3ce39b1fdd4c1d5a745eaba3b8c",
        "0x2416092f143378750bb29b79ed961ab195cceea5",
        "0x028227c4dd1e5419d11bb6fa6e661920c519d4f5"
      ]`;

    const positions = await getPositionsForAddressByPoolAtBlock(
      block, "", pairTokenList, CHAINS.MODE, PROTOCOLS.SUPSWAP, AMM_TYPES.INTEGRAL
    );

    console.log(`Block: ${block}`);
    console.log("Positions: ", positions.length);

    // Assuming this part of the logic remains the same
    let positionsWithUSDValue = positions.map(getPositionDetailsFromPosition);
    let lpValueByUsers = getLPValueByUserAndPoolFromPositions(positionsWithUSDValue);

    lpValueByUsers.forEach((value, key) => {
      let positionIndex = 0; // Define how you track position index
      value.forEach((lpValue, poolKey) => {
        const lpValueStr = lpValue.toString();
        // Accumulate CSV row data
        csvRows.push({
          user: key,
          pool: poolKey,
          block,
          position: positions.length, // Adjust if you have a specific way to identify positions
          lpvalue: lpValueStr,
        });
      });
    });
  }

  const writer = await ParquetWriter.openFile(schema, outputPath);

  for (let row of csvRows) {
    await writer.appendRow(row);
  }

  await writer.close();
  console.log("Parquet file has been written.");
};

getData().then(() => {
  console.log("Done");
});


function logWithTimestamp(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}
// getPrice(new BigNumber('1579427897588720602142863095414958'), 6, 18); //Uniswap
// getPrice(new BigNumber('3968729022398277600000000'), 18, 6); //SupSwap


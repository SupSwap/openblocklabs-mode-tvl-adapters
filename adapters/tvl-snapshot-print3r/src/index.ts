import fs from "fs";
import path from "path";
import { promisify } from "util";
import stream from "stream";
import csv from "csv-parser";
import { write } from "fast-csv";
import { Position } from "./types";
import { calculateLpValue } from "./utils/price";
import { getLiquidityProviders } from "./sdk/subgraphDetails";
import { VAULT } from "./utils/constants";

interface CSVRow {
  user: string;
  pool: string;
  block: number;
  lpvalue: number;
  pairName: string;
}

const pipeline = promisify(stream.pipeline);

const convertPositionsToCsvRow = async (
  positions: Position[],
  block: number
): Promise<CSVRow[]> => {
  const rows: CSVRow[] = [];

  for (let position of positions) {
    const lpValue = await calculateLpValue(position.amount);
    const pairName = "USDC";
    rows.push({
      user: position.account,
      pool: VAULT,
      block: block,
      lpvalue: lpValue,
      pairName: pairName,
    });
  }

  return rows;
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
            blocks.push(blockNumber);
          }
        }
      })
      .on("end", () => {
        console.log("CSV file successfully processed.");
        resolve(blocks);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
};

const processData = async () => {
  const csvFilePath = path.resolve(
    __dirname,
    "../../../../data/mode_print3r_hourly_blocks.csv"
  );
  const snapshotBlocks = await readBlocksFromCSV(csvFilePath);

  const csvRows: CSVRow[] = [];

  for (let block of snapshotBlocks) {
    const allPositions = await getLiquidityProviders(block);

    const blockCsvRows = await convertPositionsToCsvRow(allPositions, block);

    csvRows.push(...blockCsvRows);
  }

  const outputPath = path.resolve(
    __dirname,
    "../../../../data/mode_print3r_tvl_snapshot.csv"
  );
  const ws = fs.createWriteStream(outputPath);

  write(csvRows, { headers: true })
    .pipe(ws)
    .on("finish", () => {
      console.log("CSV file has been written with hourly TVL snapshot.");
    });
};

processData().then(() => {
  console.log("Data processing complete.");
});

import csv from "csv-parser";
import { write } from "fast-csv";
import fs from "fs";
import path from "path";
import { logWithTimestamp } from "../../commons/log-utils";
import { SwapCSVRow } from "../subgraphDetails";
import stream from "stream";
import { promisify } from "util";

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

// Promisify the pipeline function
const pipeline = promisify(stream.pipeline);

export async function readCSVWithPromise(filepath: string): Promise<any[]> {
  // Array to store the resulting comma-separated string array
  let results: string[] | Promise<any[]> = [];

  // Create a readable stream and process the CSV file
  await pipeline(
    fs.createReadStream(filepath),
    csv(),
    new stream.Writable({
      objectMode: true,
      write(record, encoding, callback) {
        // Convert each record (object) to a comma-separated string and push to results
        results.push(Object.values(record).join(","));
        callback();
      },
    })
  );

  return results;
}

// fs.createReadStream(path.resolve(__dirname, arg0))
//   .pipe(csv())
//   .on("data", (data) => csvArray.push(data))
//   .on("end", () => {
//     console.log("CSV file successfully processed");
//     console.log(csvArray.length);
//     // Further processing of results
//   })
//   .on("error", (err) => {
//     console.error("Error reading the CSV file", err);
//   });

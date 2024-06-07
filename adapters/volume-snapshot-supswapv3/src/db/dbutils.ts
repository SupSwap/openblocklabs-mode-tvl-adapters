import { Pool } from "pg";
import { Readable } from "stream";
import { from as copyFrom } from "pg-copy-streams";
import { logWithTimestamp } from "../commons/log-utils";
import dotenv from "dotenv";
import { PoolDetails } from "../sdk/subgraphDetails";

dotenv.config();

// Define the database connection configuration
export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT),
});

const TABLE_NAME = "users_supswap_v3_swap_volume_phase1";

// Define the table creation query
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    "user" VARCHAR(255) NOT NULL,
    "pool" VARCHAR(255) NOT NULL,
    "pair" VARCHAR(255) NOT NULL,
    "fee_usd" DECIMAL(10,2) NOT NULL,
    "volume" DECIMAL(10,2) NOT NULL,
    "token0address" VARCHAR(255) NOT NULL,
    "token1address" VARCHAR(255) NOT NULL,
    "start_timestamp" INTEGER NOT NULL,
    "end_timestamp" INTEGER NOT NULL,
    "is_contract" BOOLEAN NOT NULL DEFAULT FALSE,
    "is_eligible_for_drop1_phase_1" BOOLEAN NOT NULL DEFAULT FALSE
  )
`;

// Function to create the table
export const createTable = async (): Promise<void> => {
  logWithTimestamp("Creating table if it doesn't exist...");
  const client = await pool.connect();
  try {
    await client.query(createTableQuery);
    console.log("Table created or already exists.");
  } catch (error) {
    console.error("Error creating table:", error);
  } finally {
    client.release();
  }
};

export const deleteDataOfPoolId = async (poolId: number) => {
  const client = await pool.connect();
  await client.query(`DELETE FROM ${TABLE_NAME} WHERE pool = ${poolId}`, [
    poolId,
  ]);
  client.release();
};

export const deleteTableAllData = async () => {
  const client = await pool.connect();
  await client.query(`DELETE FROM ${TABLE_NAME}`);
  client.release();
};

export const storeDataWithCopyStream = async (
  userDataList: UserSwapVolume[]
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stream = client.query(
      copyFrom(
        `COPY ${TABLE_NAME}("user", "pool", "pair", "fee_usd", "volume", "token0address", "token1address", "start_timestamp", "end_timestamp") from STDIN`
      )
    );
    userDataList.forEach((userData, i) => {
      const {
        user: u,
        pool,
        pairName,
        feeUSD,
        volume,
        token0Address,
        token1Address,
        startTimestamp,
        endTimestamp,
      } = userData;
      logWithTimestamp(
        `Writing data to stream... ${i} of ${userDataList.length}`
      );
      stream.write(
        `${u}\t${pool}\t${pairName}\t${feeUSD}\t${volume}\t${token0Address}\t${token1Address}\t${startTimestamp}\t${endTimestamp} \n`
        // \t${
        //   pairName.split("/")[0]
        // }\t${pairName.split("/")[1].split(" ")[0]}\t${pairName
        //   .split("/")[1]
        //   .split(" ")[1]
        //   .replace("%", "")}
      );
    });
    logWithTimestamp("Ending stream...");
    stream.end();
    logWithTimestamp("Stream ended...");
    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
      stream.on("finish", resolve);
    });
    logWithTimestamp("Stream finished...");
    await client.query("COMMIT"); // Commit the transaction
    logWithTimestamp("Data stored successfully using COPY command!");
  } catch (error) {
    await client.query("ROLLBACK"); // Rollback the transaction if there's an error
    console.error("Error storing data with COPY command:", error);
  } finally {
    client.release();
  }
};

export const updatePoolInformationInDb = async (pools: PoolDetails[]) => {
  const client = await pool.connect();
  await client.query(`BEGIN`);
  for (let i = 0; i < pools.length; i++) {
    logWithTimestamp(`Updating pool ${i} of ${pools.length}`);
    await client.query(
      `UPDATE ${TABLE_NAME} SET "token0address" = $1, "token1address" = $2 WHERE "pool" = $3`,
      [pools[i].token0Address, pools[i].token1Address, pools[i].poolId]
    );
  }
  await client.query(`COMMIT`);
  client.release();
};
export const storeData = async (userDataList: UserSwapVolume[]) => {
  await deleteTableAllData();
  const client = await pool.connect();
  // Insert all data in userDataList into database and then do commit without using copystream
  const queryText = `
      INSERT INTO ${TABLE_NAME} ("user", "pool", "pair", "fee_usd", "volume", "token0address", "token1address", "start_timestamp", "end_timestamp")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
  await client.query("BEGIN");
  logWithTimestamp("Starting transaction...");
  for (let i = 0; i < userDataList.length; i++) {
    await client.query(queryText, [
      userDataList[i].user,
      userDataList[i].pool,
      userDataList[i].pairName,
      userDataList[i].feeUSD,
      userDataList[i].volume,
      userDataList[i].token0Address,
      userDataList[i].token1Address,
      userDataList[i].startTimestamp,
      userDataList[i].endTimestamp,
      // userDataList[i].pairName.split("/")[0],
      // userDataList[i].pairName.split("/")[1].split(" ")[0],
      // userDataList[i].pairName.split("/")[1].split(" ")[1].replace("%", ""),
    ]);
    logWithTimestamp(`Inserted ${i} of ${userDataList.length}`);
  }
  logWithTimestamp("Committing transaction...");
  await client.query("COMMIT");
  logWithTimestamp("Transaction committed");
  client.release();
};

import { Pool } from "pg";
import { Readable } from 'stream';
import { from as copyFrom } from 'pg-copy-streams';
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
// Define the table creation query
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS users_supswap_v3_tvl_for_phase2 (
    "user" VARCHAR(255) NOT NULL,
    "pool" VARCHAR(255) NOT NULL,
    "block" INTEGER NOT NULL,
    "userpositions" INTEGER NOT NULL,
    "lpvalue" DECIMAL(10,2) NOT NULL,
    "token0" VARCHAR(255) NOT NULL,
    "token1" VARCHAR(255) NOT NULL,
    "token0address" VARCHAR(255) NOT NULL DEFAULT '',
    "token1address" VARCHAR(255) NOT NULL DEFAULT '',
    "feetier" DECIMAL(3,2) NOT NULL,
    "is_contract" BOOLEAN NOT NULL DEFAULT FALSE,
    "is_eligible_for_drop1_phase_1" BOOLEAN NOT NULL DEFAULT FALSE,
  )
`;

// Function to create the table
export const createTable = async (): Promise<void> => {
    logWithTimestamp("Creating table if it doesn't exist...")
    const client = await pool.connect();
    try {
      await client.query(createTableQuery);
      console.log('Table created or already exists.');
    } catch (error) {
      console.error('Error creating table:', error);
    } finally {
      client.release();
    }
  }


export const deleteDataOfBlockNumber = async (blockNumber: number) => {
    const client = await pool.connect();
    await client.query(`DELETE FROM users_supswap_v3_tvl_for_phase2 WHERE block = $1`, [blockNumber]);
    client.release();
  }
  
export const storeDataWithCopyStream = async (userDataList: UserPoolTVL[]) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const stream = client.query(copyFrom('COPY users_supswap_v3_tvl_for_phase2("user", "pool", "block", "userpositions", "lpvalue", "token0", "token1", "feetier") from STDIN'));
        userDataList.forEach((userData,i) => {
            const { user: u, pool, block, position, lpvalue, pairName } = userData;
            logWithTimestamp(`Writing data to stream... ${i} of ${userDataList.length}`)
            stream.write(`${u}\t${pool}\t${block}\t${position}\t${lpvalue}\t${pairName.split("/")[0]}\t${pairName.split("/")[1].split(" ")[0]}\t${pairName.split("/")[1].split(" ")[1].replace("%", "")}\n`);
        });
        logWithTimestamp("Ending stream...")
        stream.end();
        logWithTimestamp("Stream ended...")
        await new Promise<void>((resolve, reject) => {
            stream.on('end', resolve);
            stream.on('error', reject);
            stream.on('finish', resolve);
        });
        logWithTimestamp("Stream finished...")
        await client.query('COMMIT'); // Commit the transaction
        logWithTimestamp('Data stored successfully using COPY command!');
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback the transaction if there's an error
        console.error('Error storing data with COPY command:', error);
    } finally {
        client.release();
    }
    
}

export const updatePoolInformationInDb = async (pools: PoolDetails[]) => {
    const client = await pool.connect();
    await client.query(`BEGIN`);
    for (let i = 0; i < pools.length; i++) {
        logWithTimestamp(`Updating pool ${i} of ${pools.length}`);
        await client.query(`UPDATE users_supswap_v3_tvl_for_phase2 SET "token0address" = $1, "token1address" = $2 WHERE "pool" = $3`, [pools[i].token0.id, pools[i].token1.id, pools[i].id]);
    }
    await client.query(`COMMIT`);
    client.release();
}
export const storeData = async (userDataList: UserPoolTVL[]) => {
    const client = await pool.connect();
    // Insert all data in userDataList into database and then do commit without using copystream
    const queryText = `
      INSERT INTO users_supswap_v3_tvl_for_phase2 ("user", "pool", "block", "userpositions", "lpvalue", "token0", "token1", "feetier")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    await client.query("BEGIN")
    logWithTimestamp("Starting transaction...")
    for (let i = 0; i < userDataList.length; i++) {
        await client.query(queryText, [userDataList[i].user, userDataList[i].pool, 
        userDataList[i].block, userDataList[i].userPoolPositions, userDataList[i].lpvalue,
         userDataList[i].pairName.split("/")[0], userDataList[i].pairName.split("/")[1].split(" ")[0], userDataList[i].pairName.split("/")[1].split(" ")[1].replace("%", "")])
      logWithTimestamp(`Inserted ${i} of ${userDataList.length}`)
    }
    logWithTimestamp("Committing transaction...")
    await client.query("COMMIT")
    logWithTimestamp("Transaction committed")
    client.release();
  }

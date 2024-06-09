(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import csv from "csv-parser";
import fs from "fs";
import { write } from "fast-csv";
import path from "path";
import { getBeefyVaultConfig } from "./sdk/vault/getBeefyVaultConfig";
import { getVaultShareTokenBalances } from "./sdk/vault/getVaultShareTokenBalances";
import { uniq } from "lodash";
import { getVaultBreakdowns } from "./sdk/breakdown/getVaultBreakdown";
import { BeefyVaultBreakdown } from "./sdk/breakdown/types";
import { Hex } from "viem";

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

interface CSVRow {
  user: string;
  pool: string;
  pair_name: string;
  block: number;
  position: number;
  token0_address: string;
  token0_balance: string;
  token1_address: string;
  token1_balance: string;
  lpvalue: string;
}

export const getUserTVLByBlock = async (
  blockNumber: number
): Promise<CSVRow[]> => {
  const [vaultConfigs, investorPositions] = await Promise.all([
    getBeefyVaultConfig("mode"),
    getVaultShareTokenBalances(BigInt(blockNumber)),
  ]);

  const vaultAddressWithActivePosition = uniq(
    investorPositions.map((pos) => pos.vault_address.toLowerCase())
  );
  const vaults = vaultConfigs.filter((vault) =>
    vaultAddressWithActivePosition.includes(vault.vault_address)
  );
  // get breakdowns for all vaults
  const breakdowns = await getVaultBreakdowns(BigInt(blockNumber), vaults);

  const breakdownByVaultAddress = breakdowns.reduce((acc, breakdown) => {
    acc[breakdown.vault.vault_address.toLowerCase() as Hex] = breakdown;
    return acc;
  }, {} as Record<Hex, BeefyVaultBreakdown>);

  // merge by investor address and vault address
  const investorTokenBalances: Record<
    Hex /* investor */,
    Record<
      Hex /* pool */,
      {
        position: bigint;
        token0_address: Hex;
        token0_balance: bigint;
        token1_address: Hex;
        token1_balance: bigint;
        pairName: string;
      }
    >
  > = {};
  for (const position of investorPositions) {
    const breakdown = breakdownByVaultAddress[position.vault_address];
    if (!breakdown) {
      // some test vaults were never available in the api
      continue;
    }

    if (!investorTokenBalances[position.user_address]) {
      investorTokenBalances[position.user_address] = {};
    }

    investorTokenBalances[position.user_address][position.underlying_address] =
      {
        position: BigInt(position.shares_balance),
        token0_address: breakdown.balances[0].tokenAddress,
        token0_balance:
          (BigInt(position.shares_balance) *
            breakdown.balances[0].vaultBalance) /
          breakdown.vaultTotalSupply,
        token1_address: breakdown.balances[1].tokenAddress,
        token1_balance:
          (BigInt(position.shares_balance) *
            breakdown.balances[1].vaultBalance) /
          breakdown.vaultTotalSupply,
        pairName: breakdown.pairName,
      };
  }

  // format output
  return Object.entries(investorTokenBalances)
    .map(([investor, balances]) =>
      Object.entries(balances).map(
        ([underlying_address, balance]): CSVRow => ({
          user: investor,
          pool: underlying_address,
          pair_name: balance.pairName,
          block: blockNumber,
          position: Number(balance.position),
          token0_address: balance.token0_address,
          token0_balance: balance.token0_balance.toString(),
          token1_address: balance.token1_address,
          token1_balance: balance.token1_balance.toString(),
          lpvalue: "0",
        })
      )
    )
    .flat();
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

const getData = async () => {
  const csvFilePath = path.resolve(
    __dirname,
    "../../../../data/mode_beefy_hourly_blocks.csv"
  );
  const snapshotBlocks = await readBlocksFromCSV(csvFilePath);

  const csvRows: CSVRow[] = [];

  for (let block of snapshotBlocks) {
    const result = await getUserTVLByBlock(block);
    for (let i = 0; i < result.length; i++) {
      csvRows.push(result[i]);
    }
  }

  // Write the CSV output to a file
  const outputPath = path.resolve(
    __dirname,
    "../../../../data/mode_beefy_tvl_snapshot.csv"
  );
  const ws = fs.createWriteStream(outputPath);
  write(csvRows, { headers: true })
    .pipe(ws)
    .on("finish", () => {
      console.log("CSV file has been written.");
    });
};

getData().then(() => {
  console.log("Done");
});
// getPrice(new BigNumber('1579427897588720602142863095414958'), 6, 18); //Uniswap
// getPrice(new BigNumber('3968729022398277600000000'), 18, 6); //SupSwap

import { GraphQLClient, gql } from "graphql-request";
import { BigNumber } from "bignumber.js";
import { ethers } from "ethers";
import fs from "fs";
import * as path from "path";
import csv from "csv-parser";

const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const modeV2Client = new GraphQLClient(
  "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/swapmode-v2/prod/gn"
);
// TODO: add V3
const modeV3Client = new GraphQLClient(
  "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/swapmode-v3/prod/gn"
);
const modeNFTPoolsClient = new GraphQLClient(
  "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/nft-pools-mode/prod/gn"
);

const provider = new ethers.providers.JsonRpcProvider("https://mainnet.mode.network/");
const BN_ZERO = new BigNumber(0);

const pools: {
  [pool: string]: {
    lpPrice: BigNumber;
    reserveUSD: BigNumber;
    totalSupply: BigNumber;
    pairName: string;
  };
} = {};
let nftPoolAddresses: string[];

const poolAddresses = [
  "0x03108a2efdd0b74293c4dd40b24f72e4f6d7f610", // weth-mbtc
  "0x03ad10c6dd6cd982b1785b8cd5316b8b626e3390", // usdt-smd
  "0x04627b24ede101b0a92211a92f996eda3fa6cc75", // wbtc-usdc
  "0x08262cdcb559dc08d34c95d5ca989bd57f721b20", // weth-molten
  "0x2abd30dc4b776820d412d40657c53579f814b7ca", // ezeth-usdc
  "0x35320a94f0a6eb95815e195b1c0acfcd0bb34c7f", // weth-beast
  "0x3a7f9f4e5917d0342e49988e0516ecd7e946e718", // weEth.mode-weth
  "0x3d086850a1dbb7b793d6c3ccd4a46034455c9972", // stone-usdc
  "0x50273860341bb80de359cd391bef9b2eb228753c", // weth-usdc
  "0x52e44f339d8bcb52bcc95dd90690283fe8a3ec7a", // ezeth-smd
  "0x64ed9aa7d88bfb4a085889cc34f82dfd2a2c4a25", // mbtc-usdc
  "0x68d206ce4449c01b9fd4fad617fbe9a85e0a091e", // mbtc-wbtc
  "0x71750e746db0ed0c6df9d9b88f36ebc5eafe295d", // weth-stone
  "0x7794a80b2d36f35239bd2fcc77ca0e2d2e47d9a3", // weth-wrsEth
  "0x7f3315d773350883ebb4f643ab5ec0d32d162c8a", // weth-smd
  "0x81845f2c5c1c7b757692d175930fa8e5d7b6cf60", // weth-linda
  "0x89aa47e1ccb8d4a5b1119358182f06d04471109d", // usdc-smd
  "0xa547801adc0925dd5317f475edead1736f7f4fbf", // ankrEth-weth
  "0xac727ed0a191e1f5bdade29cdd96f37c0289a2de", // jross-weth
  "0xbd2b4eccfbdefe72ac0fef2e1f8d8568af3c157b", // ion-weth
  "0xae341a96044f3625ec6f39ed1f282eed55777bda", // wbtc-usdt
  "0xc8dab61bc9d83123649691120d1c8350e41abd60", // weth-wbtc
  "0xca4fc72e62be7f2c0ba716ca075d6d74e1b8c637", // wbtc-smd
  "0xcf73c3f271272aebea3474e0beb5c1b278f4edf4", // weETH-weth
  "0xd5cfdbc1d0e93b04c92f0e4f0c6270b8a5632d05", // ezETH-weth
  "0xe1b9041bc284651bbb7a8bd0b2edbfbdf56d2fdc", // weth-usdt
  "0xe51e94daba685a802f46ca305e568fc8a5914b24", // weth-modi
  "0xeb4b0563aac65980245660496e76d03c90ad7b26", // usdc-usdt
  "0xf778311523df84930b1cac2fefd4c6be83e4b337", // mbtc-wrsETH
  "0xf927bf4a4170f29c429ad3b9d953e57df3691ec9", // weth-mochad
  "0xf958a5fb8d8429979eb9f374c2027ba1c232fecc", // ezETH-usdt
];

async function getUserWalletLps(block: number) {
  //  return readJSON(usersPath);

  // console.log("Fetching user wallet LP balances..");
  const pageSize = 1000;
  let skip = 0;
  let moreToFetch = true;

  let userData = [];

  while (moreToFetch) {
    const users: any = await modeV2Client.request(
      gql`
      query UsersQuery( $poolAddresses: [String]!) {
        users(
          block: { number: ${block} },
          first: ${pageSize},
          skip: ${skip},
          where: {
            liquidityPositions_ : {
              liquidityTokenBalance_gt: "0",
              pair_in: $poolAddresses
            }
          }) {
          id
          liquidityPositions {
            liquidityTokenBalance
            pair {
              id
              reserveUSD
              totalSupply
              reserve0
              reserve1
              token0 {
                id
                symbol
              }
              token1 {
                id
                symbol
              }
            }
          }
        }
      }`,
      {
        poolAddresses,
      }
    );

    // If the max 1000 items are returned then there are more to fetch
    moreToFetch = users.users.length === pageSize;
    skip += pageSize;

    userData = [...userData, ...users.users];
    // console.log(`${users.users.length} users`);

    await sleepWaitPromise();
  }

  console.log(`${userData.length} total users`);
  // await writeJSON(usersPath, userData);

  return userData;
}

async function getUserNFTPositionBalances(block: number) {
  const pageSize = 1000;
  let skip = 0;
  let moreToFetch = true;
  let userData = [];

  while (moreToFetch) {
    const positionData: any = await modeNFTPoolsClient.request(gql`
      query UserPositionQuery {
        userTotalBalanceForPools(
          block: { number: ${block} },
          first: ${pageSize},
          skip: ${skip},
          where: { balance_gt: "0" }
        ) {
          balance
          pool {
            id
            lpToken
          }
          user {
            id
          }
        }
      }
    `);
    moreToFetch = positionData.userTotalBalanceForPools.length === pageSize;
    skip += pageSize;
    console.log(`${positionData.userTotalBalanceForPools.length} user nft balances`);
    userData = [...userData, ...positionData.userTotalBalanceForPools];

    await sleepWaitPromise();
  }

  console.log(`${userData.length} total user position balances`);

  return userData;
}

// To filter pool addresses out of snapshot list
async function getNFTPoolAddresses() {
  const pools: any = await modeNFTPoolsClient.request(gql`
    query GetNFTPools {
      nftpools {
        id
      }
    }
  `);

  nftPoolAddresses = pools.nftpools.map((p) => p.id);
}

async function getBlockData(block: number) {
  try {
    const userWalletLps: any[] = await getUserWalletLps(block);
    let positions: any[] = await getUserNFTPositionBalances(block);

    positions = positions.filter((uw) => uw.user);

    let uniqueUserIds = [];

    for (const user of userWalletLps) {
      if (!uniqueUserIds.includes(user.id)) uniqueUserIds.push(user.id);

      // Set LP prices for NFTPool only snapshots to use
      user.liquidityPositions.forEach((lp) => {
        const pair = lp.pair;
        if (pools[pair.id]) return;

        const reserveUSD = new BigNumber(pair.reserveUSD);
        const totalSupply = new BigNumber(pair.totalSupply);
        const lpPrice = reserveUSD.div(totalSupply);

        pools[pair.id] = {
          lpPrice,
          reserveUSD,
          totalSupply,
          pairName: `${pair.token0.symbol}/${pair.token1.symbol}`,
        };
      });
    }

    for (const pos of positions) {
      if (!uniqueUserIds.includes(pos.user.id)) uniqueUserIds.push(pos.user.id);
    }

    uniqueUserIds = uniqueUserIds.filter(
      (id) =>
        id !== "0x0000000000000000000000000000000000000000" &&
        id !== "0x000000000000000000000000000000000000dead" &&
        !nftPoolAddresses.includes(id)
    );

    let allUserPositions = [];
    // let userTotals = [];

    for (const userId of uniqueUserIds) {
      // Fine if either of these is zero length
      const walletPositions = userWalletLps.filter((u) => u.id === userId);
      const nftPositions = positions.filter((p) => p.user.id === userId);

      // let totalLpValue = BN_ZERO;

      walletPositions.forEach((pos) => {
        pos.liquidityPositions.forEach((pos) => {
          const pool = pos.pair.id;
          const lpPrice = pools[pool]?.lpPrice || BN_ZERO;
          const positionBalance = new BigNumber(pos.liquidityTokenBalance);
          const lpvalue = positionBalance.multipliedBy(lpPrice);

          // totalLpValue = totalLpValue.plus(lpvalue);

          allUserPositions.push({
            user: userId,
            pool,
            lpvalue: lpvalue.toFixed(4),
            block,
            pairName: pools[pool].pairName,
          });
        });
      });

      nftPositions.forEach((p) => {
        const pool = p.pool.lpToken;
        const lpPrice = pools[pool]?.lpPrice || BN_ZERO;
        const positionBalance = new BigNumber(p.balance);
        const lpvalue = positionBalance.multipliedBy(lpPrice);

        // totalLpValue = totalLpValue.plus(lpvalue);

        allUserPositions.push({
          user: userId,
          pool,
          lpvalue: lpvalue.toFixed(4),
          block,
          pairName: pools[pool].pairName,
        });
      });

      // userTotals.push({
      //   user: userId,
      //   totalLpValue: totalLpValue.toFixed(4),
      //   block,
      // });
    }

    return allUserPositions;
  } catch (error) {
    console.error(error);
  }
}

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

async function writeCSV(
  outputPath: string,
  headers: {
    id: string;
    title: string;
  }[],
  data: any[]
) {
  try {
    const csvWriter = createCsvWriter({
      path: outputPath,
      header: headers,
    });
    await csvWriter.writeRecords(data);
  } catch (error) {
    throw error;
  }
}

// Goldsky rate limit of 50 requests per 10 seconds (= 5 per second = 200ms delay. Using buffer with 300ms)
export function sleepWaitPromise(milliseconds = 100, log = true) {
  if (log) {
    console.log(`sleepWaitPromise: waiting delay of ${milliseconds} ms...`);
  }

  return new Promise((res) => setTimeout(() => res(null), milliseconds));
}

async function run() {
  try {
    await getNFTPoolAddresses();
    // const fileData = await getBlockData(testBlock);

    const csvFilePath = path.resolve(
      __dirname,
      "../../../../data/mode_swapmodev2_hourly_blocks.csv"
    );
    const hourlyBlocks = await readBlocksFromCSV(csvFilePath);
    // const hourlyBlocks = [7337438];

    let fileData = [];
    for (const block of hourlyBlocks) {
      console.log(`Getting snapshot data for block (${block})`);
      const data = await getBlockData(block);
      await sleepWaitPromise();
      fileData = [...fileData, ...data];
    }

    const csvOutPath = path.resolve(__dirname, "../../../../data/mode_swapmodev2_tvl_snapshot.csv");
    // const csvOutPath = path.join(process.cwd(), "mode_swapmodev2_tvl_snapshot.csv");
    const ws = fs.createWriteStream(csvOutPath);
    await writeCSV(
      csvOutPath,
      [
        { id: "user", title: "user" },
        { id: "pool", title: "pool" },
        { id: "pairName", title: "pairName" },
        { id: "block", title: "block" },
        { id: "lpvalue", title: "lpvalue" },
      ],
      fileData
    );
  } catch (error) {
    console.log(error);
  }
}

run();

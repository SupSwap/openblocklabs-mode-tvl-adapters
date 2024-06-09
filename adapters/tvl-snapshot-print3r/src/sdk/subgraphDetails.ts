import { CHAINS, PROTOCOLS, SUBGRAPH_URLS } from "./config";
import { Position } from "../types";

export const getLiquidityProviders = async (
  block: number
): Promise<Position[]> => {
  const subgraphUrl = SUBGRAPH_URLS[CHAINS.MODE][PROTOCOLS.PRINT3R][0];

  let skip = 0;
  let fetchNext = true;
  const liquidityProviders: Position[] = [];

  while (fetchNext) {
    const query = `
      {
        stakedBrrrBalances(
          where: { balance_gt: "0", blockNumber_lte: "${block}" }
          first: 1000
          skip: ${skip}
      ) {
          user
          balance
          blockNumber
        }
      }
    `;

    const response = await fetch(subgraphUrl, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    const fetchedProviders = data.data.stakedBrrrBalances || [];

    for (const provider of fetchedProviders) {
      const transformedPosition: Position = {
        account: provider.user,
        amount: BigInt(provider.balance),
        blockNumber: parseInt(provider.blockNumber), // Convert to number
      };
      liquidityProviders.push(transformedPosition);
    }

    if (fetchedProviders.length < 1000) {
      fetchNext = false;
    } else {
      skip += 1000;
    }
  }

  return liquidityProviders;
};

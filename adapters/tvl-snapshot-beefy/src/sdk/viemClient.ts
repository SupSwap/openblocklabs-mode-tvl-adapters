import { sample } from "lodash";
import { createPublicClient, http } from "viem";
import { mode } from "viem/chains";
import { RPC_URLS } from "../config";

const clients = RPC_URLS.map((url) =>
  createPublicClient({
    chain: mode,
    transport: http(url),
    batch: {
      multicall: true,
    },
  })
);

export type BeefyViemClient = (typeof clients)[0];

export const getViemClient = (): BeefyViemClient => {
  return sample(clients) as BeefyViemClient;
};

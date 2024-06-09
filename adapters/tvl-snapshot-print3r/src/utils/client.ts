import { createPublicClient, http } from "viem";
import { mode } from "viem/chains";

export const publicClient = createPublicClient({
  chain: mode,
  transport: http("https://mainnet.mode.network"),
});

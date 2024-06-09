import { publicClient } from "./client";
import { BRRR_MANAGER, CONVERSION_FACTOR, LP_TOKEN_UNIT } from "./constants";
import { BrrrManagerABI } from "../abis/BrrrManager";

// Returns the price to 30 decimal places
export const getLpTokenPriceUSD = async () => {
  return await publicClient.readContract({
    address: BRRR_MANAGER,
    abi: BrrrManagerABI,
    functionName: "getPrice",
    args: [true],
  });
};

export const calculateLpValue = async (amount: bigint) => {
  const price = await getLpTokenPriceUSD();

  const valueUsd = (amount * price) / LP_TOKEN_UNIT;

  const truncatedValue = valueUsd / CONVERSION_FACTOR;

  return Number(truncatedValue) / 100;
};

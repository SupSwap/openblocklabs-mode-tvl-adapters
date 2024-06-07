interface UserSwapVolume {
  user: string;
  pool: string;
  feeUSD: string;
  volume: string;
  pairName: string;
  token0Address: string;
  token1Address: string;
  startTimestamp?: number;
  endTimestamp?: number;
}

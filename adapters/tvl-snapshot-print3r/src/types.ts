export type Depositor = {
  id: string;
  shares: bigint;
  account: string;
  vault: {
    id: string;
    pool: string;
  };
  blockNumber: string;
};

export type VaultPositions = {
  id: string;
  vault: {
    id: string;
  };
  upperTick: string[];
  lowerTick: string[];
};

export interface Position {
  account: string;
  amount: bigint;
  blockNumber: number;
}

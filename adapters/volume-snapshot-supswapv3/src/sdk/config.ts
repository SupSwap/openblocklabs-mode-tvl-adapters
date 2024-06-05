export const enum CHAINS {
  MODE = 34443,
}
export const enum PROTOCOLS {
  SUPSWAP = 0,
}

export const enum AMM_TYPES {
  UNISWAPV3 = 0,
}

export const SUBGRAPH_URLS = {
  [CHAINS.MODE]: {
    [PROTOCOLS.SUPSWAP]: {
      [AMM_TYPES.UNISWAPV3]:
        "https://api.goldsky.com/api/public/project_clrhmyxsvvuao01tu4aqj653e/subgraphs/supswap-exchange-v3/1.0.0/gn",
    },
  },
};
export const RPC_URLS = {
  [CHAINS.MODE]: "https://rpc.goldsky.com",
};

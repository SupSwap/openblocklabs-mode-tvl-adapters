export const enum CHAINS {
  MODE = 34443,
}
export const enum PROTOCOLS {
  PRINT3R = 0,
}

export const enum VERSION {
  V1 = 0,
  V2 = 1,
}

export const SUBGRAPH_URLS = {
  [CHAINS.MODE]: {
    [PROTOCOLS.PRINT3R]: {
      [VERSION.V1]:
        "https://api.studio.thegraph.com/query/73682/mode-stats/version/latest",
    },
  },
};

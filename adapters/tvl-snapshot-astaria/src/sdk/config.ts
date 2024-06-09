export const enum CHAINS {
    MODE = 34443,
}
export const enum PROTOCOLS {
    ASTARIA = 0,
}

export const SUBGRAPH_URLS = {
    [CHAINS.MODE]: {
        [PROTOCOLS.ASTARIA]: "https://api.goldsky.com/api/public/project_clvw41qofams701tk8wy0azdj/subgraphs/astaria-mode-mainnet/1.0.0/gn"
    }
}
export const RPC_URLS = {
    [CHAINS.MODE]: "https://rpc.goldsky.com"
}
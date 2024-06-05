export const enum CHAINS{
    MODE = 34443,
}
export const enum PROTOCOLS{
    POOLSHARK = 0,
}

export const enum AMM_TYPES{
    POOLSHARK = 0,
}

export const SUBGRAPH_URLS = {
    [CHAINS.MODE]: {
        [PROTOCOLS.POOLSHARK]: {
            [AMM_TYPES.POOLSHARK]: "https://api.goldsky.com/api/public/project_clr6e38ix6mms01vddnnu2ydr/subgraphs/poolshark-limit-mode-season0-block2/0.3.0/gn",
        }
    }
}
export const RPC_URLS = {
    [CHAINS.MODE]: "https://rpc.goldsky.com"
}

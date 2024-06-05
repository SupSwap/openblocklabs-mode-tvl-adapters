import BigNumber from "bignumber.js";
import { AMM_TYPES, CHAINS, PROTOCOLS, SUBGRAPH_URLS } from "./config";
import { PositionMath } from "./utils/positionMath";
import { Pool } from "pg";

export interface UserAggregatedAssetsInPools{
    token0AmountInWei: bigint;
    token1AmountInWei: bigint;
    token0AmountInDecimal: BigNumber;
    token1AmountInDecimal: BigNumber;
    lpValue: BigNumber;
}
export interface PoolDetails{
    id: string;
    token0: TokenDetails;
    token1: TokenDetails;
    feeTier: number;
}

export interface TokenDetails{
    id: string;
    decimals: number;
    name: string;
    symbol: string;
}



export interface Position{
    id: string;
    liquidity: bigint;
    owner: string;
    pool: {
        sqrtPrice: bigint;
        tick: number;
        id: string;
        feeTier: number;
    };
    tickLower: {
        tickIdx: number;
    };
    tickUpper: {
        tickIdx: number;
    };

    token0: {
        id: string;
        decimals: number;
        derivedUSD: number;
        name: string;
        symbol: string;
    };
    token1: {
        id: string;
        decimals: number;
        derivedUSD: number;
        name: string;
        symbol: string;
    }
};


export interface PositionWithUSDValue extends Position{
    token0USDValue: string;
    token1USDValue: string;
    token0AmountsInWei: bigint;
    token1AmountsInWei: bigint;
    token0DecimalValue: number;
    token1DecimalValue: number;
    feeTier: number;
    token0Symbol: string;
    token1Symbol: string;
}
    
export const getPositionsForAddressByPoolAtBlock = async (
    blockNumber: number,
    address: string,
    poolId: string,
    chainId: CHAINS,
    protocol: PROTOCOLS,
    ammType: AMM_TYPES
): Promise<Position[]> => {
    let subgraphUrl = SUBGRAPH_URLS[chainId][protocol][ammType];
    let blockQuery = blockNumber !== 0 ? ` block: {number: ${blockNumber}}` : ``;
    let poolQuery = poolId !== "" ? ` pool_:{id: "${poolId.toLowerCase()}"}` : ``;
    let ownerQuery = address !== "" ? `owner: "${address.toLowerCase()}"` : ``;

    let whereQuery = ownerQuery !== "" && poolQuery !== "" ? `where: {${ownerQuery} , ${poolQuery}}` : ownerQuery !== "" ?`where: {${ownerQuery}}`: poolQuery !== "" ? `where: {${poolQuery}}`: ``;
    let skip = 0;
    let fetchNext = true;
    let result: Position[] = [];
    while(fetchNext){
        let query = `{
            positions(${whereQuery} ${blockQuery} orderBy: transaction__timestamp, first:1000,skip:${skip}) {
            id

                liquidity
                owner
                pool {
                    sqrtPrice
                    tick
                    id
                    feeTier
                }
                tickLower{
                    tickIdx
                }
                tickUpper{
                    tickIdx
                }
                token0 {
                    id
                    decimals
                    derivedUSD
                    name
                    symbol
                }
                token1 {
                    id
                    decimals
                    derivedUSD
                    name
                    symbol
                }
            },
            _meta{
                    block{
                    number
                }
            }
        }`;

       // console.log(query)

        let response = await fetch(subgraphUrl, {
            method: "POST",
            body: JSON.stringify({ query }),
            headers: { "Content-Type": "application/json" },
        });
        let data = await response.json();
        let positions = data.data.positions;
        for (let i = 0; i < positions.length; i++) {
            let position = positions[i];
            let transformedPosition: Position = {
                id: position.id,
                liquidity: BigInt(position.liquidity),
                owner: position.owner,
                pool: {
                    sqrtPrice: BigInt(position.pool.sqrtPrice),
                    tick: Number(position.pool.tick),
                    id: position.pool.id,
                    feeTier: Number(position.pool.feeTier)
                },
                tickLower: {
                    tickIdx: Number(position.tickLower.tickIdx),
                },
                tickUpper: {
                    tickIdx: Number(position.tickUpper.tickIdx),
                },
                token0: {
                    id: position.token0.id,
                    decimals: position.token0.decimals,
                    derivedUSD: position.token0.derivedUSD,
                    name: position.token0.name,
                    symbol: position.token0.symbol,
                },
                token1: {
                    id: position.token1.id,
                    decimals: position.token1.decimals,
                    derivedUSD: position.token1.derivedUSD,
                    name: position.token1.name,
                    symbol: position.token1.symbol,
                },
            };
            result.push(transformedPosition);
            
        }
        if(positions.length < 1000){
            fetchNext = false;
        }else{
            skip += 1000;
        }
    }
    return result;
}

export const getPoolsInformationFromSubgraph = async(
    blockNumber: number,
    chainId: CHAINS,
    protocol: PROTOCOLS,
    ammType: AMM_TYPES
): Promise<PoolDetails[]> => {
    let subgraphUrl = SUBGRAPH_URLS[chainId][protocol][ammType];
    let blockQuery = blockNumber !== 0 ? `, block: {number: ${blockNumber}}` : ``;
    let query = `{
        pools {
            id
            token0 {
                id
                decimals
                derivedUSD
                name
                symbol
            }
            token1 {
                id
                decimals
                derivedUSD
                name
                symbol
            }
            feeTier
        }
    }`;
    console.log(query);
    let response = await fetch(subgraphUrl, {
        method: "POST",
        body: JSON.stringify({ query }),
        headers: { "Content-Type": "application/json" },
    });

    let data = await response.json();
    console.log(data);
    return data.data.pools;
}

export const getPositionAtBlock = async (
    blockNumber: number,
    positionId: number,
    chainId: CHAINS,
    protocol: PROTOCOLS,
    ammType: AMM_TYPES
): Promise<Position> => {
    let subgraphUrl = SUBGRAPH_URLS[chainId][protocol][ammType];
    let blockQuery = blockNumber !== 0 ? `, block: {number: ${blockNumber}}` : ``;
    let query = `{
        position(id: "${positionId}" ${blockQuery}) {
            id
            pool {
                sqrtPrice
                tick
            }
            tickLower{
                tickIdx
            }
            tickUpper{
                tickIdx
            }
            liquidity
            token0 {
                id
                decimals
                derivedUSD
                name
                symbol
            }
            token1 {
                id
                decimals
                derivedUSD
                name
                symbol
            }
        },
        _meta{
                block{
                number
            }
        }
    }`;
    let response = await fetch(subgraphUrl, {
        method: "POST",
        body: JSON.stringify({ query }),
        headers: { "Content-Type": "application/json" },
    });
    let data = await response.json();
    let position = data.data.position;


    return  {
            id: position.id,
            liquidity: BigInt(position.liquidity),
            owner: position.owner,
            pool: {
                sqrtPrice: BigInt(position.pool.sqrtPrice),
                tick: Number(position.pool.tick),
                id: position.pool.id,
                feeTier: Number(position.pool.feeTier)
            },
            tickLower: {
                tickIdx: Number(position.tickLower.tickIdx),
            },
            tickUpper: {
                tickIdx: Number(position.tickUpper.tickIdx),
            },
            token0: {
                id: position.token0.id,
                decimals: position.token0.decimals,
                derivedUSD: position.token0.derivedUSD,
                name: position.token0.name,
                symbol: position.token0.symbol,
            },
            token1: {
                id: position.token1.id,
                decimals: position.token1.decimals,
                derivedUSD: position.token1.derivedUSD,
                name: position.token1.name,
                symbol: position.token1.symbol,
            },
        };

    // let tickLow = Number(position.tickLower.tickIdx);
    // let tickHigh = Number(position.tickUpper.tickIdx);
    // let liquidity = BigInt(position.liquidity);
    // let sqrtPriceX96 = BigInt(position.pool.sqrtPrice);
    // let tick = Number(position.pool.tick);
    // let decimal0 = position.token0.decimals;
    // let decimal1 = position.token1.decimals;
    // let token0DerivedUSD = position.token0.derivedUSD;
    // let token1DerivedUSD = position.token1.derivedUSD;
    // let token0AmountsInWei = PositionMath.getToken0Amount(tick, tickLow, tickHigh, sqrtPriceX96, liquidity);
    // let token1AmountsInWei = PositionMath.getToken1Amount(tick, tickLow, tickHigh, sqrtPriceX96, liquidity);
    

    // let token0DecimalValue = Number(token0AmountsInWei) / 10 ** decimal0;
    // let token1DecimalValue = Number(token1AmountsInWei) / 10 ** decimal1;
    
    // let token0UsdValue = BigNumber(token0AmountsInWei.toString()).multipliedBy(token0DerivedUSD).div(10 ** decimal0).toFixed(4);
    // let token1UsdValue = BigNumber(token1AmountsInWei.toString()).multipliedBy(token1DerivedUSD).div(10 ** decimal1).toFixed(4);


    // return [position.token0, position.token1,token0AmountsInWei, token1AmountsInWei, token0DecimalValue, token1DecimalValue,token0UsdValue, token1UsdValue,data.data._meta];
}
export const getPoolDetailsFromPositions = (positions: Position[]): Map<string, PoolDetails> => {
    let result = new Map<string, PoolDetails>();
    for (let i = 0; i < positions.length; i++) {
        let position = positions[i];
        let poolId = position.pool.id;
        let poolDetails = result.get(poolId);
        if (poolDetails === undefined) {
            poolDetails = {
                id: poolId,
                token0: position.token0,
                token1: position.token1,
                feeTier: position.pool.feeTier,
            }
            result.set(poolId, poolDetails);
        }
    }
    return result;
}

export const getPositionDetailsFromPosition =  (
    position: Position
):PositionWithUSDValue => {
    let tickLow = position.tickLower.tickIdx;
    let tickHigh = position.tickUpper.tickIdx;
    let liquidity = position.liquidity;
    let sqrtPriceX96 = position.pool.sqrtPrice;
    let tick = Number(position.pool.tick);
    let decimal0 = position.token0.decimals;
    let decimal1 = position.token1.decimals;
    let token0DerivedUSD = position.token0.derivedUSD;
    let token1DerivedUSD = position.token1.derivedUSD;
    let token0AmountsInWei = PositionMath.getToken0Amount(tick, tickLow, tickHigh, sqrtPriceX96, liquidity);
    let token1AmountsInWei = PositionMath.getToken1Amount(tick, tickLow, tickHigh, sqrtPriceX96, liquidity);

    let token0DecimalValue = Number(token0AmountsInWei) / 10 ** decimal0;
    let token1DecimalValue = Number(token1AmountsInWei) / 10 ** decimal1;
    
    let token0UsdValue = BigNumber(token0AmountsInWei.toString()).multipliedBy(token0DerivedUSD).div(10 ** decimal0).toFixed(4);
    let token1UsdValue = BigNumber(token1AmountsInWei.toString()).multipliedBy(token1DerivedUSD).div(10 ** decimal1).toFixed(4);

    let feeTier = position.pool.feeTier;
    return {...position, token0USDValue: token0UsdValue, token1USDValue: token1UsdValue, token0AmountsInWei, token1AmountsInWei, token0DecimalValue, token1DecimalValue, feeTier, token0Symbol: position.token0.symbol, token1Symbol: position.token1.symbol};

}

export const getLPValueByUserAndPoolFromPositions = (
    positions: Position[]
): Map<string, Map<string, UserAggregatedAssetsInPools>> => {
    let result = new Map<string, Map<string, UserAggregatedAssetsInPools>>();
    for (let i = 0; i < positions.length; i++) {
        let position = positions[i];
        let poolId = position.pool.id;
        let owner = position.owner;
        let userPositions = result.get(owner);
        if (userPositions === undefined) {
            userPositions = new Map<string, UserAggregatedAssetsInPools>();
            result.set(owner, userPositions);
        }
        let poolPositions = userPositions.get(poolId);
        if (poolPositions === undefined) {
            poolPositions = {
                token0AmountInWei: BigInt(0),
                token1AmountInWei: BigInt(0),
                token0AmountInDecimal: BigNumber(0),
                token1AmountInDecimal: BigNumber(0),
                lpValue: BigNumber(0)
            }
        }
        let positionWithUSDValue = getPositionDetailsFromPosition(position);
        poolPositions.lpValue = poolPositions.lpValue.plus(BigNumber(positionWithUSDValue.token0USDValue).plus(BigNumber(positionWithUSDValue.token1USDValue)));
        poolPositions.token0AmountInWei = poolPositions.token0AmountInWei + (positionWithUSDValue.token0AmountsInWei);
        poolPositions.token1AmountInWei = poolPositions.token1AmountInWei + (positionWithUSDValue.token1AmountsInWei);
        poolPositions.token0AmountInDecimal = poolPositions.token0AmountInDecimal.plus(positionWithUSDValue.token0DecimalValue);
        poolPositions.token1AmountInDecimal = poolPositions.token1AmountInDecimal.plus(positionWithUSDValue.token1DecimalValue);
        userPositions.set(poolId, poolPositions);
    }
    return result;
}
export const getNumberOfPositionsByUserAndPoolFromPositions = (
    positions: Position[]
): Map<string, Map<string, Number>> => {
    let result = new Map<string, Map<string, Number>>();
    for (let i = 0; i < positions.length; i++) {
        let position = positions[i];
        let poolId = position.pool.id;
        let owner = position.owner;
        let userPositions = result.get(owner);
        if (userPositions === undefined) {
            userPositions = new Map<string, Number>();
            result.set(owner, userPositions);
        }
        let poolPositions = userPositions.get(poolId);
        if (poolPositions === undefined) {
            poolPositions = 0;
        }
        poolPositions = Number(poolPositions)+1
        userPositions.set(poolId, poolPositions);
    }
    return result;
}

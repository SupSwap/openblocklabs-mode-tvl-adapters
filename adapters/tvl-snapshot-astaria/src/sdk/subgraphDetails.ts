import BigNumber from "bignumber.js";
import { CHAINS, PROTOCOLS, SUBGRAPH_URLS } from "./config";

export interface Open {
    id: string;
    loanId: string;
    transactionHash_: string;
    loan_debt: [{
        id: string;
        token: string;
        amount: bigint;
    }]
    loan_collateral: [{
        id: string;
        token: string;
        amount: bigint;
    }]
    loan_borrower: string;
    loan_issuer: string;
};

export interface Close {
    loanId: string;
}

export const getOpensBeforeBlock = async (
    blockNumber: number,
    chainId: CHAINS,
    protocol: PROTOCOLS,
): Promise<Open[]> => {
    let subgraphUrl = SUBGRAPH_URLS[chainId][protocol];
    let skip = 0;
    let fetchNext = true;
    let result: Open[] = [];
    while (fetchNext) {
        let query = `{
            opens(orderBy: timestamp_, first:1000,skip:${skip}, where: {block_number_lte: ${blockNumber}}) {
                id
                loanId
                transactionHash_
                loan_debt {
                  id
                  token
                  amount
                }
                loan_collateral {
                  id
                  token
                  amount
                }
                loan_borrower
                loan_issuer
            }
            }`;

        let response = await fetch(subgraphUrl, {
            method: "POST",
            body: JSON.stringify({ query }),
            headers: { "Content-Type": "application/json" },
        });
        let data = await response.json();
        let opens = data.data.opens;
        if (opens < 1000) {
            fetchNext = false;
        } else {
            skip += 1000;
        }
        for (let i = 0; i < opens.length; i++) {
            let open = opens[i];
            let transformedOpen: Open = { ...open };
            result.push(transformedOpen);
        }
    }
    return result;
}

export const getClosesBeforeBlock = async (
    blockNumber: number,
    chainId: CHAINS,
    protocol: PROTOCOLS,
): Promise<Close[]> => {
    let subgraphUrl = SUBGRAPH_URLS[chainId][protocol];
    let skip = 0;
    let fetchNext = true;
    let result: Close[] = [];
    while (fetchNext) {
        let query = `{
            closes(orderBy: timestamp_, first:1000,skip:${skip}, where: {block_number_lte: ${blockNumber}}) {
                loanId
            }
            }`;

        let response = await fetch(subgraphUrl, {
            method: "POST",
            body: JSON.stringify({ query }),
            headers: { "Content-Type": "application/json" },
        });
        let data = await response.json();
        let closes = data.data.closes;
        if (closes < 1000) {
            fetchNext = false;
        } else {
            skip += 1000;
        }
        for (let i = 0; i < closes.length; i++) {
            let close = closes[i];
            let transformedClose: Close = { ...close };
            result.push(transformedClose);
        }
    }
    return result;
}

export const getLPValueByUser = (
    opens: Open[],
    closes: Close[]
): Map<string, Map<string, BigNumber>> => {
    // remove all loans that are closed
    const closedLoans = closes.map(x => x.loanId);
    const liveOpens = opens.filter(x => !closedLoans.includes(x.loanId))
    console.log("liveOpens: " + liveOpens.length)
    let result = new Map<string, Map<string, BigNumber>>();
    for (let i = 0; i < liveOpens.length; i++) {
        let liveOpen = liveOpens[i];

        // get how much the borrower has sent as collateral
        const borrower = liveOpen.loan_borrower;
        const borrowerOpens = result.get(borrower);
        if (!borrowerOpens) {
            result.set(borrower, new Map<string, BigNumber>());
        }
        for (let collateralIndex = 0; collateralIndex < liveOpen.loan_collateral.length; collateralIndex++) {
            const userProvidedCollateralForToken = result.get(borrower)?.get(liveOpen.loan_collateral[collateralIndex].token);
            if (!userProvidedCollateralForToken) {
                result.get(borrower)?.set(liveOpen.loan_collateral[collateralIndex].token, BigNumber(liveOpen.loan_collateral[collateralIndex].amount.toString()))
            } else {
                result.get(borrower)?.set(liveOpen.loan_collateral[collateralIndex].token, userProvidedCollateralForToken.plus(BigNumber(liveOpen.loan_collateral[collateralIndex].amount.toString())))
            }
        }

        // get how much the issuer has sent as debt
        const issuer = liveOpen.loan_issuer;
        const issuerOpens = result.get(issuer);
        if (!issuerOpens) {
            result.set(issuer, new Map<string, BigNumber>());
        }
        for (let debtIndex = 0; debtIndex < liveOpen.loan_debt.length; debtIndex++) {
            const userProvidedDebtForToken = result.get(issuer)?.get(liveOpen.loan_debt[debtIndex].token);
            if (!userProvidedDebtForToken) {
                result.get(issuer)?.set(liveOpen.loan_debt[debtIndex].token, BigNumber(liveOpen.loan_debt[debtIndex].amount.toString()))
            } else {
                result.get(issuer)?.set(liveOpen.loan_debt[debtIndex].token, userProvidedDebtForToken.plus(BigNumber(liveOpen.loan_debt[debtIndex].amount.toString())))
            }
        }
    }
    return result;
}

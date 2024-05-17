// get the following json and parse it to print only address field in lower case.
// read tokens list from the url : https://raw.githubusercontent.com/SupSwap/tokens/main/list/tokens.json

export interface TokenList{
    tokens: Token[];
}

export interface Token{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
}

export const tokensFromGitUrl = async (url:string) => {
  const tokenList = await fetch(url).then(response => response.json()) as TokenList;

  return tokenList.tokens.map(token => `'${token.address.toLocaleLowerCase()}'`);
 
}


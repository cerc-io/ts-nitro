import {
  providers, BigNumber,
} from 'ethers';

import { Token__factory } from '../src/contract-bindings/factories/Token__factory';

export async function getTokenBalanceByAddress(token: string, address: string, chainURL: string): Promise<BigNumber> {
  const provider = new providers.JsonRpcProvider(chainURL);
  const tokenFactory = Token__factory.connect(token, provider.getSigner());

  return tokenFactory.balanceOf(address);
}

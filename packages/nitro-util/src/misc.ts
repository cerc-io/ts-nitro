import {
  providers, Wallet, BigNumber,
} from 'ethers';

export async function getAddressByKey(chainPrivateKey: string, chainURL: string): Promise<string> {
  const provider = new providers.JsonRpcProvider(chainURL);
  const signer = new Wallet(chainPrivateKey, provider);

  return signer.getAddress();
}

export async function getBalanceByAddress(address: string, chainURL: string): Promise<BigNumber> {
  const provider = new providers.JsonRpcProvider(chainURL);

  return provider.getBalance(address);
}

export async function getBalanceByKey(chainPrivateKey: string, chainURL: string): Promise<BigNumber> {
  const address = await getAddressByKey(chainPrivateKey, chainURL);

  return getBalanceByAddress(address, chainURL);
}

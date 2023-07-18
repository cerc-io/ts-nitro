import { ethers } from 'ethers';
import { Buffer } from 'buffer';

import { EthClient } from '@cerc-io/nitro-util';

// connectToChain connects to the chain at the given url and returns a client and a transactor.
export async function connectToChain(chainUrl: string, chainPK: Buffer): Promise<[EthClient, ethers.Signer]> {
  const client = await EthClient.dial(chainUrl);

  const txSigner = new ethers.Wallet(chainPK, client.provider);

  return [client, txSigner];
}

export async function connectToChainWithoutKey(chainUrl: string): Promise<EthClient> {
  return EthClient.dial(chainUrl);
}

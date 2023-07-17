import assert from 'assert';
import {
  ethers, providers, EventFilter, Wallet, BigNumber,
} from 'ethers';
import { Buffer } from 'buffer';

export class EthClient {
  provider: providers.BaseProvider;

  constructor(provider: providers.BaseProvider) {
    this.provider = provider;
  }

  static dial(chainUrl: string): EthClient {
    // Connect to the Ethereum provider
    const provider = new ethers.providers.JsonRpcProvider(chainUrl);
    return new EthClient(provider);
  }

  async transactionByHash(transactionHash: string): Promise<providers.TransactionResponse> {
    assert(this.provider);

    // Get transaction by hash
    const transaction = await this.provider.getTransaction(transactionHash);
    return transaction;
  }

  async chainID(): Promise<bigint> {
    assert(this.provider);

    // Get chain ID
    const network = await this.provider.getNetwork();
    return BigInt(network.chainId);
  }

  subscribeFilterLogs(filter: EventFilter, callback: (log: providers.Log) => void): providers.Listener {
    assert(this.provider);

    // Subscribe to filtered logs
    const listener = (log: providers.Log) => {
      callback(log);
    };

    this.provider.on(filter, listener);

    return listener;
  }
}

// connectToChain connects to the chain at the given url and returns a client and a transactor.
export async function connectToChain(chainUrl: string, chainPK: Buffer): Promise<[EthClient, ethers.Signer]> {
  const client = await EthClient.dial(chainUrl);
  const txSigner = new ethers.Wallet(chainPK, client.provider);

  return [client, txSigner];
}
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

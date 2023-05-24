import assert from 'assert';
import { ethers, providers, EventFilter } from 'ethers';

export class EthClient {
  private provider?: providers.JsonRpcProvider;

  async dial(chainUrl: string): Promise<void> {
    // Connect to the Ethereum provider
    this.provider = new ethers.providers.JsonRpcProvider(chainUrl);
  }

  async transactionByHash(transactionHash: string): Promise<providers.TransactionResponse> {
    assert(this.provider);

    // Get transaction by hash
    const transaction = await this.provider.getTransaction(transactionHash);
    return transaction;
  }

  async chainID(): Promise<number> {
    assert(this.provider);

    // Get chain ID
    const chainId = await this.provider.getNetwork();
    return chainId.chainId;
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

// ConnectToChain connects to the chain at the given url and returns a client and a transactor.
// TODO: Add keyed transactor
// TODO: Can run into an error
// TODO: ctx required?
export async function ConnectToChain(chainUrl: string): Promise<EthClient> {
  const client = new EthClient();
  await client.dial(chainUrl);

  return client;
}

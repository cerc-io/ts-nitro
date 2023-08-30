import assert from 'assert';
import {
  ethers, providers, EventFilter,
} from 'ethers';

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

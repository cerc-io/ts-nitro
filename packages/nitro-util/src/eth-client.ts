import assert from 'assert';
import {
  ethers, providers,
} from 'ethers';

import type { Log } from '@ethersproject/abstract-provider';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';

export class EthClient {
  provider: providers.BaseProvider;

  constructor(provider: providers.BaseProvider) {
    this.provider = provider;
  }

  static dial(chainUrl: string): EthClient {
    // Connect to the Ethereum provider
    const provider = new ethers.providers.WebSocketProvider(chainUrl);
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

  subscribeFilterLogs(query: ethers.providers.EventType, ch: ReadWriteChannel<Log>): () => void {
    const eventListener = async (eventLog: Log) => {
      ch.push(eventLog);
    };
    this.provider.on(query, eventListener);

    return () => {
      this.provider.off(query, eventListener);
    };
  }

  subscribeNewHead(ch: ReadWriteChannel<number>): () => void {
    const newBlockListener = (blockNumber: number) => {
      // *ethTypes.Header have full block information
      // but only block number is used.
      // get full block information if those are used in future
      ch.push(blockNumber);
    };
    this.provider.on('block', newBlockListener);

    return () => {
      this.provider.off('block', newBlockListener);
    };
  }

  subscriptionError(ch: ReadWriteChannel<Error>) {
    const subErrListener = (err: Error) => {
      ch.push(err);
    };
    this.provider.on('error', subErrListener);

    return () => {
      this.provider.off('error', subErrListener);
    };
  }
}

import { ethers } from 'ethers';
import debug from 'debug';

import type { ReadChannel, ReadWriteChannel } from '@nodeguy/channel';
import type { Log } from '@ethersproject/abstract-provider';
import createChannel from '@nodeguy/channel';

import { NitroAdjudicator } from './adjudicator/nitro-adjudicator';
import { ChainService, ChainEvent } from './chainservice';
import { ChainTransaction } from '../../../protocols/interfaces';
import { Address } from '../../../types/types';
import { ConnectToChain } from './utils/utils';

interface EthChain {
  // TODO: Extend bind.ContractBackend (github.com/ethereum/go-ethereum/accounts/abi/bind)
  // TODO: Extend ethereum.TransactionReader (github.com/ethereum/go-ethereum)

  // TODO: Can throw an error
  chainID (ctx: AbortController): Promise<bigint>;
}

interface BlockRange {
  from: bigint;
  to: bigint;
}

export class EthChainService implements ChainService {
  private chain: EthChain;

  private na: NitroAdjudicator;

  private naAddress: string;

  private consensusAppAddress: string;

  private virtualPaymentAppAddress: string;

  private txSigner: ethers.Transaction;

  private out: ReadWriteChannel<ChainEvent>;

  private logger: debug.Debugger;

  private ctx: AbortController;

  private cancel: (reason ?: any) => void;

  constructor(
    chain: EthChain,
    na: NitroAdjudicator,
    naAddress: string,
    consensusAppAddress: string,
    virtualPaymentAppAddress: string,
    txSigner: ethers.Transaction,
    out: ReadWriteChannel<ChainEvent>,
    logger: debug.Debugger,
    ctx: AbortController,
    cancel: () => void,
  ) {
    this.chain = chain;
    this.na = na;
    this.naAddress = naAddress;
    this.consensusAppAddress = consensusAppAddress;
    this.virtualPaymentAppAddress = virtualPaymentAppAddress;
    this.txSigner = txSigner;
    this.out = out;
    this.logger = logger;
    this.ctx = ctx;
    this.cancel = cancel;
  }

  // newEthChainService is a convenient wrapper around _newEthChainService, which provides a simpler API
  static async newEthChainService(
    chainUrl: string,
    chainPk: string,
    naAddress: Address,
    caAddress: Address,
    vpaAddress: Address,
    logDestination: WritableStream,
  ): Promise<EthChainService> {
    if (vpaAddress === caAddress) {
      throw new Error(`virtual payment app address and consensus app address cannot be the same: ${vpaAddress}`);
    }

    // TODO: Get txSigner
    const ethClient = await ConnectToChain(chainUrl);

    // TODO: Initialize NitroAdjudicator
    const na = new NitroAdjudicator();

    return EthChainService._newEthChainService(ethClient, na, naAddress, caAddress, vpaAddress, logDestination);
  }

  // _newEthChainService constructs a chain service that submits transactions to a NitroAdjudicator
  // and listens to events from an eventSource
  static _newEthChainService(
    chain: EthChain,
    na: NitroAdjudicator,
    naAddress: Address,
    caAddress: Address,
    vpaAddress: Address,
    logDestination: WritableStream,
  ): EthChainService {
    // TODO: Configure logger

    // TODO: Create AbortController
    const cancelFunc = () => {};

    const out = createChannel<ChainEvent>(10);

    // Use a buffered channel so we don't have to worry about blocking on writing to the channel.
    const ecs = new EthChainService(
      chain,
      na,
      naAddress,
      caAddress,
      vpaAddress,
      {} as ethers.Transaction,
      out,
      {} as debug.Debugger,
      {} as AbortController,
      cancelFunc,
    );

    ecs.subscribeForLogs();

    return ecs;
  }

  // defaultTxOpts returns transaction options suitable for most transaction submissions
  // TODO: Implement and remove void
  private defaultTxOpts(): ethers.Transaction | void {}

  // sendTransaction sends the transaction and blocks until it has been submitted.
  // TODO: Implement and remove void
  sendTransaction(tx: ChainTransaction): Error | void {}

  // fatalF is called to output a message and then panic, killing the chain service.
  // TODO: Implement
  private fatalF(format: string, ...v: any[]) {}

  // dispatchChainEvents takes in a collection of event logs from the chain
  // TODO: Implement
  private dispatchChainEvents(logs: Log[]) {}

  // subscribeForLogs subscribes for logs and pushes them to the out channel.
  // It relies on notifications being supported by the chain node.
  // TODO: Implement
  private subscribeForLogs() {}

  // splitBlockRange takes a BlockRange and chunks it into a slice of BlockRanges, each having an interval no larger than the passed interval.
  // TODO: Implement and remove void
  private splitBlockRange(total: BlockRange, maxInterval: bigint): BlockRange[] | void {}

  // eventFeed returns the out chan, and narrows the type so that external consumers may only receive on it.
  // TODO: Implement
  eventFeed(): ReadChannel<ChainEvent> {
    return this.out.readOnly();
  }

  // TODO: Implement
  getConsensusAppAddress(): Address {
    return ethers.constants.AddressZero;
  }

  // TODO: Implement
  getVirtualPaymentAppAddress(): Address {
    return ethers.constants.AddressZero;
  }

  // TODO: Implement and remove void
  // TODO: Can throw an error
  getChainId(): bigint {
    return BigInt(0);
  }

  // TODO: Implement and remove void
  close(): Error | void {}
}

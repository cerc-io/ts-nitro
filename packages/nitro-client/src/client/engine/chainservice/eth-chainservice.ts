import { AddressLike, Log, TransactionLike } from 'ethers';
import debug from 'debug';

import { NitroAdjudicator } from './adjudicator/nitro-adjudicator';
import { Event } from './chainservice';
import { GoChannelPlaceholder, GoReceivingChannelPlaceholder } from '../../../go-channel';
import { ChainTransaction } from '../../../protocols/interfaces';

interface EthChain {
  // TODO: Extend bind.ContractBackend (github.com/ethereum/go-ethereum/accounts/abi/bind)
  // TODO: Extend ethereum.TransactionReader (github.com/ethereum/go-ethereum)

  // TODO: Can throw an error
  chainID: (ctx: AbortController) => bigint
}

interface BlockRange {
  from: bigint;
  to: bigint;
}

export class EthChainService {
  private chain: EthChain;

  private na: NitroAdjudicator;

  private naAddress: AddressLike;

  private consensusAppAddress: AddressLike;

  private virtualPaymentAppAddress: AddressLike;

  private txSigner: TransactionLike;

  private out: GoChannelPlaceholder<Event>;

  private logger: debug.Debugger;

  private ctx: AbortController;

  private cancel: (reason ?: any) => void;

  constructor(
    chain: EthChain,
    na: NitroAdjudicator,
    naAddress: AddressLike,
    consensusAppAddress: AddressLike,
    virtualPaymentAppAddress: AddressLike,
    txSigner: TransactionLike,
    out: GoChannelPlaceholder<Event>,
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
  // TODO: Implement and remove void
  static newEthChainService(
    chainUrl: string,
    chainPk: string,
    naAddress: AddressLike,
    caAddress: AddressLike,
    vpaAddress: AddressLike,
    logDestination: WritableStream,
  ): EthChainService | void {}

  // defaultTxOpts returns transaction options suitable for most transaction submissions
  // TODO: Implement and remove void
  private defaultTxOpts(): TransactionLike | void {}

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
  // TODO: Implement and remove void
  eventFeed(): GoReceivingChannelPlaceholder<Event> | void {}

  // TODO: Implement and remove void
  getConsensusAppAddress(): AddressLike | void {}

  // TODO: Implement and remove void
  getVirtualPaymentAppAddress(): AddressLike | void {}

  // TODO: Implement and remove void
  // TODO: Can throw an error
  getChainId(): bigint | void {}

  // TODO: Implement and remove void
  close(): Error | void {}
}

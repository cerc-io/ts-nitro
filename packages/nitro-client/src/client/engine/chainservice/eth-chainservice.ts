import { AddressLike, TransactionLike } from 'ethers';
import debug from 'debug';

import { NitroAdjudicator } from './adjudicator/nitro-adjudicator';
import { Event } from './chainservice';
import { GoChannelPlaceholder } from '../../../go-channel';

interface EthChain {
  // TODO: Extend bind.ContractBackend (github.com/ethereum/go-ethereum/accounts/abi/bind)
  // TODO: Extend ethereum.TransactionReader (github.com/ethereum/go-ethereum)

  chainID: (ctx: AbortController) => [bigint, Error]
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
}

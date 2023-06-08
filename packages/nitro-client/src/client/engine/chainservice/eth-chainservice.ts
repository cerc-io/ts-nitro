import assert from 'assert';
import { ethers } from 'ethers';
import debug from 'debug';

import type { ReadChannel, ReadWriteChannel } from '@nodeguy/channel';
import type { Log } from '@ethersproject/abstract-provider';
import Channel from '@nodeguy/channel';
import { EthClient, connectToChain } from '@cerc-io/nitro-util';

import { ChainService, ChainEvent } from './chainservice';
import { ChainTransaction, DepositTransaction, WithdrawAllTransaction } from '../../../protocols/interfaces';
import { Address } from '../../../types/types';
import { Token__factory } from './erc20/token';
import { INitroTypes, NitroAdjudicator__factory, NitroAdjudicator } from './adjudicator/nitro-adjudicator';
import * as NitroAdjudicatorConversions from './adjudicator/typeconversions';

const log = debug('ts-nitro:eth-chain-service');

interface EthChain extends EthClient {
  // TODO: Extend bind.ContractBackend (github.com/ethereum/go-ethereum/accounts/abi/bind)
  // TODO: Extend ethereum.TransactionReader (github.com/ethereum/go-ethereum)

  // TODO: Can throw an error
  chainID (): Promise<bigint>;
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

  private txSigner: ethers.Signer;

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
    txSigner: ethers.Signer,
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
    logDestination?: WritableStream,
  ): Promise<EthChainService> {
    if (vpaAddress === caAddress) {
      throw new Error(`virtual payment app address and consensus app address cannot be the same: ${vpaAddress}`);
    }

    const [ethClient, txSigner] = await connectToChain(chainUrl, Buffer.from(chainPk));

    const na = NitroAdjudicator__factory.connect(naAddress, txSigner);

    return EthChainService._newEthChainService(ethClient, na, naAddress, caAddress, vpaAddress, txSigner, logDestination);
  }

  // _newEthChainService constructs a chain service that submits transactions to a NitroAdjudicator
  // and listens to events from an eventSource
  private static _newEthChainService(
    chain: EthChain,
    na: NitroAdjudicator,
    naAddress: Address,
    caAddress: Address,
    vpaAddress: Address,
    txSigner: ethers.Signer,
    logDestination?: WritableStream,
  ): EthChainService {
    // TODO: Create AbortController
    const cancelFunc = () => {};

    const out = Channel<ChainEvent>(10);

    // Use a buffered channel so we don't have to worry about blocking on writing to the channel.
    const ecs = new EthChainService(
      chain,
      na,
      naAddress,
      caAddress,
      vpaAddress,
      txSigner,
      out,
      log,
      {} as AbortController,
      cancelFunc,
    );

    // TODO: Implement
    ecs.subscribeForLogs();

    return ecs;
  }

  // defaultTxOpts returns transaction options suitable for most transaction submissions
  // TODO: Implement (if required)
  private defaultTxOpts(): void {}

  // sendTransaction sends the transaction and blocks until it has been submitted.
  // TODO: Implement and remove void
  async sendTransaction(tx: ChainTransaction): Promise<void> {
    switch (tx.constructor) {
      case DepositTransaction: {
        const depositTx = tx as DepositTransaction;
        assert(depositTx.deposit);
        for (const [tokenAddress, amount] of depositTx.deposit.value.entries()) {
          const txOpts: ethers.PayableOverrides = {};
          const ethTokenAddress = ethers.constants.AddressZero;

          if (tokenAddress === ethTokenAddress) {
            txOpts.value = ethers.BigNumber.from(amount);
          } else {
            const tokenTransactor = Token__factory.connect(tokenAddress, this.txSigner);
            // eslint-disable-next-line no-await-in-loop
            await tokenTransactor.approve(this.naAddress, amount);
          }

          // eslint-disable-next-line no-await-in-loop
          const holdings = await this.na.holdings(tokenAddress, depositTx.channelId().value);

          // eslint-disable-next-line no-await-in-loop
          await this.na.deposit(tokenAddress, depositTx.channelId().value, holdings, amount, txOpts);
        }

        break;
      }

      case WithdrawAllTransaction: {
        const withdrawAllTx = tx as WithdrawAllTransaction;
        assert(withdrawAllTx.signedState);

        const state = withdrawAllTx.signedState.state();
        const signatures = withdrawAllTx.signedState.signatures();
        const nitroFixedPart = NitroAdjudicatorConversions.convertFixedPart(state.fixedPart());
        const nitroVariablePart = NitroAdjudicatorConversions.convertVariablePart(state.variablePart());
        const nitroSignatures = [
          NitroAdjudicatorConversions.convertSignature(signatures[0]),
          NitroAdjudicatorConversions.convertSignature(signatures[1]),
        ];

        const candidate: INitroTypes.SignedVariablePartStruct = {
          variablePart: nitroVariablePart,
          sigs: nitroSignatures,
        };

        await this.na.concludeAndTransferAllAssets(nitroFixedPart, candidate);

        break;
      }

      default:
        throw new Error(`Unexpected transaction type ${tx.constructor}`);
    }
  }

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

  getConsensusAppAddress(): Address {
    return this.consensusAppAddress;
  }

  // TODO: Implement
  getVirtualPaymentAppAddress(): Address {
    return ethers.constants.AddressZero;
  }

  getChainId(): Promise<bigint> {
    return this.chain.chainID();
  }

  // TODO: Implement and remove void
  close(): Error | void {}
}

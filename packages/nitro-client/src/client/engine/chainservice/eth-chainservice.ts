import assert from 'assert';
import { ethers } from 'ethers';
import debug from 'debug';

import type { ReadChannel, ReadWriteChannel } from '@nodeguy/channel';
import type { Log } from '@ethersproject/abstract-provider';
import Channel from '@nodeguy/channel';
import { connectToChain, go } from '@cerc-io/nitro-util';

import { ChainService, ChainEvent, DepositedEvent } from './chainservice';
import { ChainTransaction, DepositTransaction, WithdrawAllTransaction } from '../../../protocols/interfaces';
import { Address } from '../../../types/types';
import { Token__factory } from './erc20/token';
import { Destination } from '../../../types/destination';
import {
  INitroTypes, NitroAdjudicator__factory, NitroAdjudicator, DepositedEventObject,
} from './adjudicator/nitro-adjudicator';
import * as NitroAdjudicatorConversions from './adjudicator/typeconversions';

const log = debug('ts-nitro:eth-chain-service');

const allocationUpdatedTopic = ethers.utils.keccak256('AllocationUpdated(bytes32,uint256,uint256)');
const concludedTopic = ethers.utils.keccak256('Concluded(bytes32,uint48)');
const depositedTopic = ethers.utils.keccak256('Deposited(bytes32,address,uint256,uint256)');
// eslint-disable-next-line max-len
const challengeRegisteredTopic = ethers.utils.keccak256('ChallengeRegistered(bytes32 indexed channelId, uint48 turnNumRecord, uint48 finalizesAt, bool isFinal, (address[],uint64,address,uint48) fixedPart, (((address,(uint8,bytes),(bytes32,uint256,uint8,bytes)[])[],bytes,uint48,bool),(uint8,bytes32,bytes32)[])[] proof, (((address,(uint8,bytes),(bytes32,uint256,uint8,bytes)[])[],bytes,uint48,bool),(uint8,bytes32,bytes32)[]) candidate)');
const challengeClearedTopic = ethers.utils.keccak256('ChallengeCleared(bytes32 indexed channelId, uint48 newTurnNumRecord)');

interface EthChain {
  // Following Interfaces in Go have been implemented using EthClient.provider (ethers Provider)
  //  bind.ContractBackend (github.com/ethereum/go-ethereum/accounts/abi/bind)
  //  ethereum.TransactionReader (github.com/ethereum/go-ethereum)
  provider: ethers.providers.JsonRpcProvider

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
    const ctx = new AbortController();
    const cancelCtx = ctx.abort.bind(ctx);

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
      ctx,
      cancelCtx,
    );

    ecs.subscribeForLogs();

    return ecs;
  }

  // defaultTxOpts returns transaction options suitable for most transaction submissions
  // TODO: Implement (if required)
  private defaultTxOpts(): void {}

  // sendTransaction sends the transaction and blocks until it has been submitted.
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
  private fatalF(message: string) {
    // Print to STDOUT in case we're using a noop logger
    // eslint-disable-next-line no-console
    console.log(message);

    this.logger(message);

    // Manually panic in case we're using a logger that doesn't call exit(1)
    throw new Error(message);
  }

  // dispatchChainEvents takes in a collection of event logs from the chain
  private dispatchChainEvents(logs: Log[]) {
    for (const l of logs) {
      switch (l.topics[0]) {
        case depositedTopic:
          try {
            const nad = this.na.interface.parseLog(l).args as unknown as DepositedEventObject;
            const event = DepositedEvent.newDepositedEvent(
              new Destination(nad.destination),
              String(l.blockNumber),
              nad.asset,
              nad.amountDeposited.toBigInt(),
              nad.destinationHoldings.toBigInt(),
            );
            this.out.push(event);
          } catch (err) {
            this.fatalF(`error in ParseDeposited: ${err}`);
          }
          break;

        case allocationUpdatedTopic:
          // TODO: Implement
          break;

        case concludedTopic:
          // TODO: Implement
          break;

        case challengeRegisteredTopic:
          this.logger('Ignoring Challenge Registered event');
          break;

        case challengeClearedTopic:
          this.logger('Ignoring Challenge Cleared event');
          break;

        default:
          this.logger(`Ignoring unknown chain event topic: ${l.topics[0].toString()}`);
          break;
      }
    }
  }

  // subscribeForLogs subscribes for logs and pushes them to the out channel.
  // It relies on notifications being supported by the chain node.
  private subscribeForLogs() {
    // Subscribe to Adjudicator events
    const query: ethers.providers.EventType = {
      address: this.naAddress,
    };
    const logs = Channel<Log>();
    const listener = (eventLog: Log) => logs.push(eventLog);
    try {
      this.chain.provider.on(query, listener);
    } catch (err) {
      // TODO: Implement
      this.fatalF(`subscribeFilterLogs failed: ${err}`);
    }

    // Channel to implement sub.Err()
    const subErr = Channel<Error>();
    const subErrListener = (err: Error) => subErr.push(err);
    this.chain.provider.on('error', subErrListener);

    // Method to implement sub.Unsubscribe
    const subUnsubscribe = () => {
      this.chain.provider.off(query, listener);
      this.chain.provider.off('error', subErrListener);

      // Implement sub.Unsubscribe behaviour to close sub.Err() channel
      subErr.close();
    };

    // Channel to implement ctx.Done()
    const ctxDone = Channel();
    this.ctx.signal.onabort = () => { ctxDone.close(); };

    // Must be in a goroutine to not block chain service constructor
    go(async () => {
      while (true) {
        /* eslint-disable no-await-in-loop */
        /* eslint-disable default-case */
        switch (await Channel.select([
          ctxDone.shift(),
          subErr.shift(),
          logs.shift(),
        ])) {
          case ctxDone:
            subUnsubscribe();
            return;

          case subErr: {
            const err = subErr.value();
            if (err) {
              this.fatalF(`received error from the subscription channel: ${err}`);
            }

            // If the error is nil then the subscription was closed and we need to re-subscribe.
            // This is a workaround for https://github.com/ethereum/go-ethereum/issues/23845
            try {
              this.chain.provider.on(query, listener);
            } catch (sErr) {
              this.fatalF(`subscribeFilterLogs failed on resubscribe: ${err}`);
            }
            this.logger('resubscribed to filtered logs');
            break;
          }

          // // TODO: Check if recreating subscription after interval is required
          // case <-time.After(RESUB_INTERVAL):
          //   // Due to https://github.com/ethereum/go-ethereum/issues/23845 we can't rely on a long running subscription.
          //   // We unsub here and recreate the subscription in the next iteration of the select.
          //   sub.Unsubscribe()

          case logs:
            // TODO: Implement
            this.dispatchChainEvents([logs.value()]);
            break;
        }
      }
    });
  }

  // splitBlockRange takes a BlockRange and chunks it into a slice of BlockRanges, each having an interval no larger than the passed interval.
  // TODO: Implement and remove void
  private splitBlockRange(total: BlockRange, maxInterval: bigint): BlockRange[] | void {}

  // eventFeed returns the out chan, and narrows the type so that external consumers may only receive on it.
  eventFeed(): ReadChannel<ChainEvent> {
    return this.out.readOnly();
  }

  getConsensusAppAddress(): Address {
    return this.consensusAppAddress;
  }

  getVirtualPaymentAppAddress(): Address {
    return this.virtualPaymentAppAddress;
  }

  getChainId(): Promise<bigint> {
    return this.chain.chainID();
  }

  // TODO: Implement and remove void
  close(): Error | void {}
}

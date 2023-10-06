import assert from 'assert';
import { ethers, providers } from 'ethers';
import debug from 'debug';
import { WaitGroup } from '@jpwilliams/waitgroup';
import Heap from 'heap';
import { Mutex } from 'async-mutex';

import type { ReadChannel, ReadWriteChannel } from '@cerc-io/ts-channel';
import type { Log } from '@ethersproject/abstract-provider';
import Channel from '@cerc-io/ts-channel';
import {
  EthClient, go, hex2Bytes, Context, WrappedError,
  JSONbigNative, Uint64,
} from '@cerc-io/nitro-util';

import {
  ChainService, ChainEvent, DepositedEvent, ConcludedEvent, AllocationUpdatedEvent, ChallengeRegisteredEvent,
} from './chainservice';
import {
  ChainTransaction, ChallengeTransaction, DepositTransaction, WithdrawAllTransaction,
} from '../../../protocols/interfaces';
import { Address } from '../../../types/types';
import { Token__factory } from './erc20/token';
import { Destination } from '../../../types/destination';
import {
  INitroTypes, NitroAdjudicator__factory, NitroAdjudicator, DepositedEventObject, AllocationUpdatedEventObject,
  ConcludedEventObject, ChallengeRegisteredEventObject,
} from './adjudicator/nitro-adjudicator';
import * as NitroAdjudicatorConversions from './adjudicator/typeconversions';

import { assetAddressForIndex } from './eth-chain-helpers';
import { connectToChain } from './utils/utils';
import { VariablePart } from '../../../channel/state/state';
import { convertBindingsExitToExit, convertBindingsSignaturesToSignatures } from './adjudicator/reverse_typeconversions';
import { ChainOpts } from '../../../internal/chain/chain';
import { EventTracker } from './event-queue';

const log = debug('ts-nitro:eth-chain-service');

// REQUIRED_BLOCK_CONFIRMATIONS is how many blocks must be mined before an emitted event is processed
const REQUIRED_BLOCK_CONFIRMATIONS = 2;

// MAX_EPOCHS is the maximum range of old epochs we can query with a single "FilterLogs" request
// This is a restriction enforced by the rpc provider
const MAX_EPOCHS = 60480;

const naInterface = NitroAdjudicator__factory.createInterface();
const concludedTopic = ethers.utils.id(naInterface.getEvent('Concluded').format());
const allocationUpdatedTopic = ethers.utils.id(naInterface.getEvent('AllocationUpdated').format());
const depositedTopic = ethers.utils.id(naInterface.getEvent('Deposited').format());
const challengeRegisteredTopic = ethers.utils.id(naInterface.getEvent('ChallengeRegistered').format());
const challengeClearedTopic = ethers.utils.id(naInterface.getEvent('ChallengeCleared').format());

const topicsToWatch: string[] = [
  allocationUpdatedTopic,
  concludedTopic,
  depositedTopic,
  challengeRegisteredTopic,
  challengeClearedTopic,
];

interface EthChain {
  // Following Interfaces in Go have been implemented using EthClient.provider (ethers Provider)
  //  bind.ContractBackend (github.com/ethereum/go-ethereum/accounts/abi/bind)
  //  ethereum.TransactionReader (github.com/ethereum/go-ethereum)
  provider: ethers.providers.BaseProvider

  chainID (): Promise<bigint>;
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

  private ctx: Context;

  private cancel: () => void;

  private wg?: WaitGroup;

  private eventTracker: EventTracker;

  constructor(
    chain: EthChain,
    na: NitroAdjudicator,
    naAddress: string,
    consensusAppAddress: string,
    virtualPaymentAppAddress: string,
    txSigner: ethers.Signer,
    out: ReadWriteChannel<ChainEvent>,
    logger: debug.Debugger,
    ctx: Context,
    cancel: () => void,
    wg: WaitGroup,
    eventTracker: EventTracker,
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
    this.wg = wg;
    this.eventTracker = eventTracker;
  }

  // newEthChainService is a convenient wrapper around _newEthChainService, which provides a simpler API
  static async newEthChainService(chainOpts: ChainOpts): Promise<ChainService> {
    let ethClient;
    let txSigner;

    if (chainOpts.chainPk) {
      assert(chainOpts.chainUrl);
      [ethClient, txSigner] = await connectToChain(chainOpts.chainUrl, hex2Bytes(chainOpts.chainPk));
    }

    if (chainOpts.provider) {
      ethClient = new EthClient(chainOpts.provider);
      txSigner = chainOpts.provider.getSigner();
    }

    if (chainOpts.vpaAddress === chainOpts.caAddress) {
      throw new Error(`virtual payment app address and consensus app address cannot be the same: ${chainOpts.vpaAddress}`);
    }

    assert(ethClient);
    assert(txSigner);
    const na = NitroAdjudicator__factory.connect(chainOpts.naAddress, txSigner);

    return EthChainService._newEthChainService(
      ethClient,
      chainOpts.chainStartBlock,
      na,
      chainOpts.naAddress,
      chainOpts.caAddress,
      chainOpts.vpaAddress,
      txSigner,
    );
  }

  // _newEthChainService constructs a chain service that submits transactions to a NitroAdjudicator
  // and listens to events from an eventSource
  private static async _newEthChainService(
    chain: EthChain,
    startBlock: Uint64,
    na: NitroAdjudicator,
    naAddress: Address,
    caAddress: Address,
    vpaAddress: Address,
    txSigner: ethers.Signer,
  ): Promise<EthChainService> {
    const ctx = new Context();
    const cancelCtx = ctx.withCancel();

    const tracker = EventTracker.newEventTracker(startBlock);
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
      new WaitGroup(),
      tracker,
    );

    const [
      errChan,
      subErr,
      newBlockSubUnSubscribe,
      newBlockChan,
      eventSubUnSubscribe,
      eventChan,
      eventQuery,
      eventListener,
      newBlockListener,
    ] = ecs.subscribeForLogs();

    // Prevent go routines from processing events before checkForMissedEvents completes
    const release = await ecs.eventTracker.mu.acquire();
    try {
      ecs.wg!.add(4);
      go(ecs.listenForEventLogs.bind(ecs), errChan, eventSubUnSubscribe, eventChan);
      go(ecs.listenForNewBlocks.bind(ecs), errChan, newBlockSubUnSubscribe, newBlockChan);
      go(
        ecs.listenForSubscriptionError.bind(ecs),
        errChan,
        subErr,
        eventQuery,
        eventListener,
        eventSubUnSubscribe,
        newBlockListener,
        newBlockSubUnSubscribe,
      );
      go(ecs.listenForErrors.bind(ecs), errChan);

      // Search for any missed events emitted while this node was offline
      await ecs.checkForMissedEvents(startBlock);
    } finally {
      release();
    }

    return ecs;
  }

  private async checkForMissedEvents(startBlock: Uint64): Promise<void> {
    // Fetch the latest block
    const latestBlock = await this.chain.provider.getBlock('latest');
    const latestBlockNum = latestBlock.number;

    this.logger(JSONbigNative.stringify({
      msg: 'checking for missed chain events',
      startBlock,
      currentBlock: latestBlockNum,
    }));

    // Loop through in chunks of MAX_EPOCHS
    for (let currentStart = startBlock; currentStart <= latestBlockNum;) {
      let currentEnd = currentStart + BigInt(MAX_EPOCHS);

      if (currentEnd > latestBlockNum) {
        currentEnd = BigInt(latestBlockNum);
      }

      // Create a query for the current chunk
      const query: ethers.providers.Filter = {
        fromBlock: Number(currentStart),
        toBlock: Number(currentEnd),
        address: this.naAddress,
        topics: [topicsToWatch],
      };

      // Fetch logs for the current chunk
      let missedEvents;
      try {
        // eslint-disable-next-line no-await-in-loop
        missedEvents = await this.chain.provider.getLogs(query);
      } catch (err) {
        this.logger(`failed to retrieve old chain logs. ${(err as Error).message}`);

        let errorMsg = '*** To avoid this error, consider increasing the chainstartblock value in your configuration before restarting the node.';
        errorMsg += ' Note that this may cause your node to miss chain events emitted prior to the chainstartblock.';

        this.logger(errorMsg);
        throw err;
      }

      this.logger(JSONbigNative.stringify({
        msg: 'finished checking for missed chain events in range',
        fromBlock: currentStart,
        toBlock: currentEnd,
        numMissedEvents: missedEvents.length,
      }));

      for (let i = 0; i < missedEvents.length; i += 1) {
        const event = missedEvents[i];
        this.eventTracker.push(event);
      }

      currentStart = currentEnd + BigInt(1); // Move to the next chunk
    }
  }

  private async listenForSubscriptionError(
    errorChan: ReadWriteChannel<Error>,
    subErr: ReadWriteChannel<Error>,
    eventQuery: ethers.providers.EventType,
    eventListener: (eventLog: Log) => void,
    eventSubUnSubscribe: () => void,
    newBlockListener: (blockNumber: number) => void,
    newBlockSubUnSubscribe: () => void,
  ): Promise<void> {
    // eslint-disable-next-line no-labels, no-restricted-syntax
    out:
    while (true) {
      // eslint-disable-next-line default-case, no-await-in-loop
      switch (await Channel.select([
        this.ctx.done.shift(),
        subErr.shift(),
      ])) {
        case this.ctx.done: {
          this.wg!.done();
          subErr.close();
          return;
        }
        case subErr: {
          const err = subErr.value();
          if (err) {
            this.logger(`error in subscription: ${err}`);
            eventSubUnSubscribe();
            newBlockSubUnSubscribe();
          }

          // Try to re-establish subscription once before failing
          try {
            this.chain.provider.on(eventQuery, eventListener);
          } catch (sErr) {
            // eslint-disable-next-line no-await-in-loop
            await errorChan.push(new WrappedError(`subscribeFilterLogs failed on resubscribe: ${sErr}`, sErr as Error));
            // eslint-disable-next-line no-labels
            break out;
          }
          this.logger('resubscribed to filtered event logs');

          // Try to re-establish subscription once before failing
          try {
            this.chain.provider.on('block', newBlockListener);
          } catch (sErr) {
            // eslint-disable-next-line no-await-in-loop
            await errorChan.push(new WrappedError(`subscribeNewHead failed on resubscribe: ${sErr}`, sErr as Error));
            // eslint-disable-next-line no-labels
            break out;
          }
          this.logger('resubscribed to new blocks');
          break;
        }
      }
    }
  }

  // listenForErrors listens for errors on the error channel and attempts to handle them if they occur.
  // TODO: Currently "handle" is panicking
  private async listenForErrors(errChan: ReadChannel<Error>): Promise<void> {
    while (true) {
      // eslint-disable-next-line no-await-in-loop, default-case
      switch (await Channel.select([
        this.ctx.done.shift(),
        errChan.shift(),
      ])) {
        case this.ctx.done: {
          this.wg!.done();
          return;
        }
        case errChan: {
          const err = errChan.value();
          this.logger(JSON.stringify({
            msg: 'chain service error',
            err: (err as Error).message,
          }));
          throw err;
        }
      }
    }
  }

  // defaultTxOpts returns transaction options suitable for most transaction submissions
  // TODO: Implement (if required)
  private defaultTxOpts(): void {}

  // sendTransaction sends the transaction and blocks until it has been submitted.
  async sendTransaction(tx: ChainTransaction): Promise<void> {
    assert(this.txSigner, 'txSigner not assigned in chainservice');
    this.na = this.na.connect(this.txSigner);

    switch (tx.constructor) {
      case DepositTransaction: {
        const depositTx = tx as DepositTransaction;

        for await (const [tokenAddress, amount] of depositTx.deposit.value.entries()) {
          const txOpts: ethers.PayableOverrides = {};
          const ethTokenAddress = ethers.constants.AddressZero;

          if (tokenAddress === ethTokenAddress) {
            txOpts.value = ethers.BigNumber.from(amount);
          } else {
            const tokenTransactor = Token__factory.connect(tokenAddress, this.txSigner);
            await tokenTransactor.approve(this.naAddress, amount);
            // TODO: wait for the Approve tx to be mined before continuing
          }

          const holdings = await this.na.holdings(tokenAddress, depositTx.channelId().value);
          this.logger(JSONbigNative.stringify({
            msg: 'existing holdings',
            holdings: holdings.toBigInt(),
          }));
          await this.na.deposit(tokenAddress, depositTx.channelId().value, holdings, amount, txOpts);
        }

        break;
      }

      case WithdrawAllTransaction: {
        const withdrawAllTx = tx as WithdrawAllTransaction;

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

      case ChallengeTransaction: {
        const challengeTx = tx as ChallengeTransaction;

        const [fp, candidate] = NitroAdjudicatorConversions.convertSignedStateToFixedPartAndSignedVariablePart(challengeTx.candidate);
        const proof = NitroAdjudicatorConversions.convertSignedStatesToProof(challengeTx.proof);
        const challengerSig = NitroAdjudicatorConversions.convertSignature(challengeTx.challengerSig);

        await this.na.challenge(fp, proof, candidate, challengerSig);
        break;
      }
      default:
        throw new Error(`Unexpected transaction type ${tx.constructor}`);
    }
  }

  // dispatchChainEvents takes in a collection of event logs from the chain
  // and dispatches events to the out channel
  private async dispatchChainEvents(logs: Log[]): Promise<void> {
    for await (const l of logs) {
      switch (l.topics[0]) {
        case depositedTopic: {
          try {
            this.logger('Processing Deposited event');
            const nad = this.na.interface.parseLog(l).args as unknown as DepositedEventObject;
            const event = DepositedEvent.newDepositedEvent(
              new Destination(nad.destination),
              BigInt(l.blockNumber),
              BigInt(l.transactionIndex),
              nad.asset,
              nad.destinationHoldings.toBigInt(),
            );
            await this.out.push(event);
          } catch (err) {
            throw new Error(`error in ParseDeposited: ${err}`);
          }
          break;
        }
        case allocationUpdatedTopic: {
          this.logger('Processing AllocationUpdated event');
          let au;
          try {
            au = this.na.interface.parseLog(l).args as unknown as AllocationUpdatedEventObject;
          } catch (err) {
            throw new Error(`error in ParseAllocationUpdated: ${err}`);
          }

          let tx;
          try {
            tx = await this.chain.provider.getTransaction(l.transactionHash);
            if (tx.confirmations < 1) {
              // If confirmations less than 1, then tx is pending
              throw new Error('Expected transaction to be part of the chain, but the transaction is pending');
            }
          } catch (err) {
            throw new Error(`error in TransactionByHash: ${err}`);
          }

          assert(tx !== undefined);
          assert(au !== undefined);
          let assetAddress: Address;
          try {
            assetAddress = assetAddressForIndex(this.na, tx, au.assetIndex.toBigInt());
          } catch (err) {
            throw new WrappedError(
              `error in assetAddressForIndex: ${err}`,
              err as Error,
            );
          }

          this.logger(JSON.stringify({
            msg: 'assetAddress',
            assetAddress,
          }));
          assert(assetAddress !== undefined);
          const event = AllocationUpdatedEvent.newAllocationUpdatedEvent(
            new Destination(au.channelId),
            BigInt(l.blockNumber),
            BigInt(l.transactionIndex),
            assetAddress,
            au.finalHoldings.toBigInt(),
          );
          await this.out.push(event);
          break;
        }
        case concludedTopic: {
          this.logger('Processing Concluded event');
          try {
            const ce = this.na.interface.parseLog(l).args as unknown as ConcludedEventObject;
            const event = new ConcludedEvent({ _channelID: new Destination(ce.channelId), _blockNum: BigInt(l.blockNumber) });
            await this.out.push(event);
          } catch (err) {
            throw new Error(`error in ParseConcluded: ${err}`);
          }
          break;
        }
        case challengeRegisteredTopic: {
          try {
            const cr = this.na.interface.parseLog(l).args as unknown as ChallengeRegisteredEventObject;

            const event = ChallengeRegisteredEvent.NewChallengeRegisteredEvent(
              new Destination(cr.channelId),
              BigInt(l.blockNumber),
              BigInt(l.transactionIndex),
              new VariablePart({
                appData: Buffer.from(cr.candidate.variablePart.appData.toString()),
                outcome: convertBindingsExitToExit(cr.candidate.variablePart.outcome),
                turnNum: BigInt(cr.candidate.variablePart.turnNum),
                isFinal: cr.candidate.variablePart.isFinal,
              }),
              convertBindingsSignaturesToSignatures(cr.candidate.sigs),
            );

            this.out.push(event);
          } catch (err) {
            throw new Error(`error in ParseChallengeRegistered: ${err}`);
          }
          break;
        }
        case challengeClearedTopic:
          this.logger('Ignoring Challenge Cleared event');
          break;
        default:
          this.logger(JSON.stringify({
            msg: 'Ignoring unknown chain event topic',
            topics: l.topics[0].toString(),
          }));
          break;
      }
    }
  }

  private async listenForEventLogs(
    errorChan: ReadWriteChannel<Error>,
    eventSubUnSubscribe: () => void,
    eventChan: ReadWriteChannel<Log>,
  ) {
    while (true) {
      // eslint-disable-next-line no-await-in-loop, default-case
      switch (await Channel.select([
        this.ctx.done.shift(),
        eventChan.shift(),
      ])) {
        case this.ctx.done: {
          eventSubUnSubscribe();
          this.wg!.done();
          return;
        }

        // // TODO: Check if recreating subscription after interval is required
        // case <-time.After(RESUB_INTERVAL):
        //   // Due to https://github.com/ethereum/go-ethereum/issues/23845 we can't rely on a long running subscription.
        //   // We unsub here and recreate the subscription in the next iteration of the select.
        //   sub.Unsubscribe()

        case eventChan: {
          const chainEvent = eventChan.value();
          for (let i = 0; i < topicsToWatch.length; i += 1) {
            const topic = topicsToWatch[i];
            if (chainEvent.topics[0] === topic) {
              this.logger(JSON.stringify({
                msg: 'queueing new chainEvent',
                'block-num': chainEvent.blockNumber,
              }));
              // eslint-disable-next-line no-await-in-loop
              await this.updateEventTracker(errorChan, undefined, chainEvent);
            }
          }
          break;
        }
      }
    }
  }

  private async listenForNewBlocks(
    errorChan: ReadWriteChannel<Error>,
    newBlockSubUnSubscribe: () => void,
    newBlockChan: ReadWriteChannel<number>,
  ) {
    // eslint-disable-next-line no-restricted-syntax, no-labels
    while (true) {
      // eslint-disable-next-line no-await-in-loop, default-case
      switch (await Channel.select([
        this.ctx.done.shift(),
        newBlockChan.shift(),
      ])) {
        case this.ctx.done: {
          newBlockSubUnSubscribe();
          this.wg!.done();
          return;
        }

        case newBlockChan: {
          const newBlockNum = newBlockChan.value();
          // this.logger(JSON.stringify({
          //   msg: 'detected new block',
          //   'block-num': newBlockNum,
          // }));
          // eslint-disable-next-line no-await-in-loop
          await this.updateEventTracker(errorChan, BigInt(newBlockNum), undefined);
          break;
        }
      }
    }
  }

  // updateEventTracker accepts a new block number and/or new event and dispatches a chain event if there are enough block confirmations
  private async updateEventTracker(
    errorChan: ReadWriteChannel<Error>,
    blockNumber: bigint | undefined,
    chainEvent: ethers.providers.Log | undefined,
  ) {
    // lock the mutex for the shortest amount of time. The mutex only need to be locked to update the eventTracker data structure
    const release = await this.eventTracker.mu.acquire();
    const eventsToDispatch: ethers.providers.Log[] = [];

    try {
      if (blockNumber && blockNumber > this.eventTracker.latestBlockNum!) {
        this.eventTracker.latestBlockNum = blockNumber;
      }

      if (chainEvent) {
        this.eventTracker.push(chainEvent);

        this.logger(JSON.stringify({
          msg: 'event added to queue',
          'updated-queue-length': this.eventTracker.events!.size(),
        }));
      }

      while (
        this.eventTracker.events!.size() > 0
        && this.eventTracker.latestBlockNum! >= this.eventTracker.events!.peek()!.blockNumber + REQUIRED_BLOCK_CONFIRMATIONS
      ) {
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const chainEvent = this.eventTracker.pop();

        assert(chainEvent);
        eventsToDispatch.push(chainEvent);

        this.logger(JSON.stringify({
          msg: 'event popped from queue',
          'updated-queue-length': this.eventTracker.events!.size(),
        }));
      }
    } finally {
      release();
    }

    try {
      await this.dispatchChainEvents(eventsToDispatch);
    } catch (err) {
      await errorChan.push(new WrappedError(
        `failed dispatchChainEvents: ${err}`,
        err as Error,
      ));
    }
  }

  // subscribeForLogs subscribes for logs and pushes them to the out channel.
  // It relies on notifications being supported by the chain node.
  private subscribeForLogs(): [
    ReadWriteChannel<Error>,
    ReadWriteChannel<Error>,
    () => void,
    ReadWriteChannel<number>,
    () => void,
    ReadWriteChannel<ethers.providers.Log>,
    ethers.providers.EventType,
    (eventLog: Log) => void,
    (blockNumber: number) => void,
  ] {
    // Subscribe to Adjudicator events
    const eventQuery: ethers.providers.EventType = {
      address: this.naAddress,
    };
    const eventChan = Channel<Log>();
    const eventListener = (eventLog: Log) => {
      eventChan.push(eventLog);
    };

    try {
      this.chain.provider.on(eventQuery, eventListener);
    } catch (err) {
      throw new WrappedError(`subscribeFilterLogs failed: ${err}`, err as Error);
    }

    const errorChan = Channel<Error>();

    const newBlockChan = Channel<number>();
    const newBlockListener = (blockNumber: number) => {
      // *ethTypes.Header have full block information
      // but only block number is used.
      // get full block information if those are used in future
      newBlockChan.push(blockNumber);
    };

    try {
      this.chain.provider.on('block', newBlockListener);
    } catch (err) {
      throw new WrappedError(`subscribeNewHead failed: ${err}`, err as Error);
    }

    // Channel to implement subscription.Err() for eventSub and newBlockSub
    const subErr = Channel<Error>();
    const subErrListener = (err: Error) => {
      subErr.push(err);
    };
    this.chain.provider.on('error', subErrListener);

    // Method to implement eventSub.UnSubscribe
    const eventSubUnSubscribe = () => {
      this.chain.provider.off(eventQuery, eventListener);
      this.chain.provider.off('error', subErrListener);
    };

    // Method to implement newBlockSub.UnSubscribe
    const newBlockSubUnSubscribe = () => {
      this.chain.provider.off('block', newBlockListener);
      this.chain.provider.off('error', subErrListener);
    };

    return [
      errorChan,
      subErr,
      newBlockSubUnSubscribe,
      newBlockChan,
      eventSubUnSubscribe,
      eventChan,
      eventQuery,
      eventListener,
      newBlockListener,
    ];
  }

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

  async getLastConfirmedBlockNum(): Promise<Uint64> {
    let confirmedBlockNum: Uint64;

    const release = await this.eventTracker.mu.acquire();

    try {
      // Check for potential underflow
      if (this.eventTracker.latestBlockNum! >= REQUIRED_BLOCK_CONFIRMATIONS) {
        confirmedBlockNum = this.eventTracker.latestBlockNum! - BigInt(REQUIRED_BLOCK_CONFIRMATIONS);
      } else {
        confirmedBlockNum = BigInt(0);
      }
    } finally {
      release();
    }

    return confirmedBlockNum;
  }

  async close(): Promise<void> {
    this.cancel();
    if (this.chain.provider instanceof providers.WebSocketProvider) {
      await this.chain.provider.destroy();
    }
    await this.wg!.wait();
  }
}

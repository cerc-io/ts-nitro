/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-use-before-define */

import debug from 'debug';
import assert from 'assert';
import _ from 'lodash';
import { WaitGroup } from '@jpwilliams/waitgroup';

import Channel from '@cerc-io/ts-channel';
import type { ReadChannel, ReadWriteChannel } from '@cerc-io/ts-channel';
import {
  JSONbigNative, go, Context, WrappedError, Ticker,
} from '@cerc-io/nitro-util';

import { MessageService } from './messageservice/messageservice';
import { ChainService, ChainEvent } from './chainservice/chainservice';
import { ErrNoSuchObjective, Store, ErrLoadVouchers } from './store/store';
import { PolicyMaker } from './policy-maker';
import { MetricsApi, MetricsRecorder, NoOpMetrics } from './metrics';
import { VoucherManager } from '../../payments/voucher-manager';
import {
  Objective, ObjectiveRequest, ObjectiveStatus, ProposalReceiver, SideEffects,
} from '../../protocols/interfaces';
import { Message, ObjectiveId, ObjectivePayload } from '../../protocols/messages';
import { ConsensusChannel, Proposal, ProposalType } from '../../channel/consensus-channel/consensus-channel';
import { Address } from '../../types/types';
import { Voucher } from '../../payments/vouchers';
import { LedgerChannelInfo, PaymentChannelInfo } from '../query/types';
import {
  ObjectiveRequest as DirectFundObjectiveRequest,
  Objective as DirectFundObjective,
  isDirectFundObjective,
  ErrLedgerChannelExists,
} from '../../protocols/directfund/directfund';
import {
  ObjectiveRequest as DirectDefundObjectiveRequest,
  Objective as DirectDefundObjective,
  isDirectDefundObjective,
} from '../../protocols/directdefund/directdefund';
import {
  Objective as VirtualFundObjective,
  ObjectiveRequest as VirtualFundObjectiveRequest,
  isVirtualFundObjective,
  ObjectivePrefix as VirtualFundObjectivePrefix,
} from '../../protocols/virtualfund/virtualfund';
import {
  ObjectiveRequest as VirtualDefundObjectiveRequest,
  Objective as VirtualDefundObjective,
  isVirtualDefundObjective,
  getVirtualChannelFromObjectiveId,
  ObjectivePrefix as VirtualDefundObjectivePrefix,
} from '../../protocols/virtualdefund/virtualdefund';
import * as channel from '../../channel/channel';
import { VirtualChannel } from '../../channel/virtual';
import {
  constructLedgerInfoFromChannel, constructLedgerInfoFromConsensus, constructPaymentInfo, getPaymentChannelInfo, getVoucherBalance,
} from '../query/query';
import { PAYER_INDEX, getPayee, getPayer } from '../../payments/helpers';
import { Destination } from '../../types/destination';
import { withObjectiveIdAttribute } from '../../internal/logging/logging';

const log = debug('ts-nitro:engine');

const SENT_VOUCHERS_CHANNEL_BUFFER_SIZE = 100;
const METRICS_ENABLED = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ErrUnhandledChainEvent extends Error {
  event?: ChainEvent;

  channel?: channel.Channel;

  reason: string = '';

  constructor(params: {
    event?: ChainEvent,
    channel?: channel.Channel;
    reason?: string
  }) {
    super(`Chain event ${params.event} could not be handled by channel ${params.channel} due to: ${params.reason ?? ''}`);
    Object.assign(this);
  }
}

const Incoming: MessageDirection = 'Incoming';
const Outgoing: MessageDirection = 'Outgoing';

export type PaymentRequest = {
  channelId: Destination
  amount?: bigint
};

// EngineEvent is a struct that contains a list of changes caused by handling a message/chain event/api event
export class EngineEvent {
  // These are objectives that are now completed
  completedObjectives: Objective[] = [];

  // These are objectives that have failed
  failedObjectives: ObjectiveId[] = [];

  // ReceivedVouchers are vouchers we've received from other participants
  receivedVouchers: Voucher[] = [];

  // LedgerChannelUpdates contains channel info for ledger channels that have been updated
  ledgerChannelUpdates: LedgerChannelInfo[] = [];

  // PaymentChannelUpdates contains channel info for payment channels that have been updated
  paymentChannelUpdates: PaymentChannelInfo[] = [];

  constructor(params: {
    failedObjectives?: ObjectiveId[];
    completedObjectives?: Objective[];
    receivedVouchers?: Voucher[];
    ledgerChannelUpdates?: LedgerChannelInfo[];
    paymentChannelUpdates?: PaymentChannelInfo[]
  }) {
    Object.assign(this, params);
  }

  // IsEmpty returns true if the EngineEvent contains no changes
  isEmpty(): boolean {
    return (
      this.completedObjectives.length === 0
      && this.failedObjectives.length === 0
      && this.receivedVouchers.length === 0
      && this.ledgerChannelUpdates.length === 0
      && this.paymentChannelUpdates.length === 0
    );
  }

  merge(other: EngineEvent): void {
    this.completedObjectives.push(...other.completedObjectives);
    this.failedObjectives.push(...other.failedObjectives);
    this.receivedVouchers.push(...other.receivedVouchers);
    this.ledgerChannelUpdates.push(...other.ledgerChannelUpdates);
    this.paymentChannelUpdates.push(...other.paymentChannelUpdates);
  }
}

class ErrGetObjective extends Error {
  wrappedError: Error = new Error();

  objectiveId?: ObjectiveId;

  constructor(params: { wrappedError?: Error, objectiveId?: ObjectiveId }) {
    super(`unexpected error getting/creating objective ${params.objectiveId}: ${params.wrappedError}`);
    Object.assign(this, params);
  }

  error(): string {
    return `unexpected error getting/creating objective ${this.objectiveId}: ${this.wrappedError}`;
  }
}

// nonFatalErrors is a list of errors for which the engine should not panic
const nonFatalErrors: Error[] = [
  new ErrGetObjective({}),
  ErrLoadVouchers,
  ErrLedgerChannelExists,
];

// Engine is the imperative part of the core business logic of a go-nitro Node
export class Engine {
  objectiveRequestsFromAPI?: ReadWriteChannel<ObjectiveRequest>;

  paymentRequestsFromAPI?: ReadWriteChannel<PaymentRequest>;

  private fromChain?: ReadChannel<ChainEvent>;

  private fromMsg?: ReadChannel<Message>;

  private fromLedger?: ReadWriteChannel<Proposal>;

  private eventHandler?: (engineEvent: EngineEvent) => void;

  private msg?: MessageService;

  private chain?: ChainService;

  // A Store for persisting and restoring important data
  private store?: Store;

  // A PolicyMaker decides whether to approve or reject objectives
  private policymaker?: PolicyMaker;

  private logger: debug.Debugger = log;

  private metrics?: MetricsRecorder;

  private vm?: VoucherManager;

  // Custom channel for vouchers being sent
  private _sentVouchers?: ReadWriteChannel<Voucher>;

  private cancel?: (reason?: any) => void;

  private wg?: WaitGroup;

  static new(
    vm: VoucherManager,
    msg: MessageService,
    chain: ChainService,
    store: Store,
    policymaker: PolicyMaker,
    eventHandler: (engineEvent: EngineEvent) => void,
    metricsApi?: MetricsApi,
  ) {
    const e = new Engine();
    e.store = store;

    e.fromLedger = Channel<Proposal>(100);
    // bind to inbound channels
    e.objectiveRequestsFromAPI = Channel<ObjectiveRequest>();
    e.paymentRequestsFromAPI = Channel<PaymentRequest>();

    e.fromChain = chain.eventFeed();
    e.fromMsg = msg.p2pMessages();

    e.chain = chain;
    e.msg = msg;

    e.eventHandler = eventHandler;

    e.policymaker = policymaker;

    e.vm = vm;

    e.logger('Constructed Engine');

    if (METRICS_ENABLED) {
      // If a metrics API is not provided we used the no-op version which does nothing.
      if (!metricsApi) {
        // eslint-disable-next-line no-param-reassign
        metricsApi = new NoOpMetrics();
      }

      e.metrics = MetricsRecorder.newMetricsRecorder(
        e.store.getAddress(),
        metricsApi,
      );
    }

    e.wg = new WaitGroup();

    const ctx = new Context();
    e.cancel = ctx.withCancel();

    e.wg.add(1);
    go(e.run.bind(e), ctx);

    e._sentVouchers = Channel<Voucher>(SENT_VOUCHERS_CHANNEL_BUFFER_SIZE);

    return e;
  }

  get sentVouchers(): ReadChannel<Voucher> {
    assert(this._sentVouchers);
    return this._sentVouchers.readOnly();
  }

  async close(): Promise<void> {
    assert(this.cancel);
    assert(this.wg);
    assert(this.msg);
    assert(this.chain);

    this.cancel();
    await this.wg.wait();

    await this.msg.close();
    await this.chain.close();
  }

  // run kicks of an infinite loop that waits for communications on the supplied channels, and handles them accordingly
  // The loop exits when the context is cancelled.
  async run(ctx: Context): Promise<void> {
    assert(this.objectiveRequestsFromAPI);
    assert(this.paymentRequestsFromAPI);
    assert(this.fromChain);
    assert(this.fromMsg);
    assert(this.fromLedger);
    assert(this.eventHandler);
    assert(this.store);
    assert(this.chain);

    while (true) {
      let res = new EngineEvent({});
      let err: Error | null = null;

      // eslint-disable-next-line no-await-in-loop
      const blockTicker = await Ticker.newTicker(15 * 1000);

      if (METRICS_ENABLED) {
        this.metrics!.recordQueueLength('api_objective_request_queue', this.objectiveRequestsFromAPI.channelLength());
        this.metrics!.recordQueueLength('api_payment_request_queue', this.paymentRequestsFromAPI.channelLength());
        this.metrics!.recordQueueLength('chain_events_queue', this.fromChain.channelLength());
        this.metrics!.recordQueueLength('messages_queue', this.fromMsg.channelLength());
        this.metrics!.recordQueueLength('proposal_queue', this.fromLedger.channelLength());
      }

      /* eslint-disable no-await-in-loop */
      /* eslint-disable default-case */
      switch (await Channel.select([
        this.objectiveRequestsFromAPI.shift(),
        this.paymentRequestsFromAPI.shift(),
        this.fromChain.shift(),
        this.fromMsg.shift(),
        this.fromLedger.shift(),
        ctx.done.shift(),
        blockTicker.c!.shift(),
      ])) {
        case this.objectiveRequestsFromAPI:
          [res, err] = await this.handleObjectiveRequest(this.objectiveRequestsFromAPI.value());
          break;

        case this.paymentRequestsFromAPI:
          [res, err] = await this.handlePaymentRequest(this.paymentRequestsFromAPI.value());
          break;

        case this.fromChain:
          [res, err] = await this.handleChainEvent(this.fromChain.value());
          break;

        case this.fromMsg:
          [res, err] = await this.handleMessage(this.fromMsg.value());
          break;

        case this.fromLedger:
          [res, err] = await this.handleProposal(this.fromLedger.value());
          break;

        case blockTicker.c: {
          const blockNum = await this.chain.getLastConfirmedBlockNum();

          try {
            await this.store.setLastBlockNumSeen(blockNum);
          } catch (storeErr) {
            err = storeErr as Error;
          }
          break;
        }

        case ctx.done: {
          // Stop ticker instance
          blockTicker.stop();
          this.wg!.done();
          return;
        }
      }

      // Stop ticker instance
      blockTicker.stop();

      // Handle errors
      if (err) {
        await this.checkError(err);
      }

      // Only send out an event if there are changes
      if (!res.isEmpty()) {
        res.completedObjectives?.forEach((obj) => {
          assert(this.logger);
          this.logger(JSON.stringify({
            msg: 'Objective is complete & returned to API',
            ...withObjectiveIdAttribute(obj.id()),
          }));

          if (METRICS_ENABLED) {
            this.metrics!.recordObjectiveCompleted(obj.id());
          }
        });

        this.eventHandler(res);
      }
    }
  }

  // handleProposal handles a Proposal returned to the engine from
  // a running ledger channel by pulling its corresponding objective
  // from the store and attempting progress.
  private async handleProposal(proposal: Proposal): Promise<[EngineEvent, Error | null]> {
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.handleProposal.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      assert(this.store);
      const id = getProposalObjectiveId(proposal);

      let obj: Objective;
      try {
        obj = await this.store.getObjectiveById(id);
      } catch (err) {
        return [new EngineEvent({}), err as Error];
      }

      if (obj.getStatus() === ObjectiveStatus.Completed) {
        this.logger(JSON.stringify({
          msg: 'Ignoring proposal for completed objective',
          ...withObjectiveIdAttribute(id),
        }));
        return [new EngineEvent({}), null];
      }

      return await this.attemptProgress(obj);
    } finally {
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // handleMessage handles a Message from a peer go-nitro Wallet.
  // It:
  //   - reads an objective from the store,
  //   - generates an updated objective,
  //   - attempts progress on the target Objective,
  //   - attempts progress on related objectives which may have become unblocked.
  private async handleMessage(message: Message): Promise<[EngineEvent, Error | null]> {
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = () => this.metrics!.recordFunctionDuration(this.handleMessage.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      assert(this.policymaker);
      assert(this.store);
      assert(this.vm);

      this.logMessage(message, Incoming);
      const allCompleted = new EngineEvent({});

      for await (const payload of (message.objectivePayloads ?? [])) {
        let objective: Objective;
        try {
          objective = await this.getOrCreateObjective(payload);
        } catch (err) {
          return [new EngineEvent({}), err as Error];
        }

        if (objective.getStatus() === ObjectiveStatus.Unapproved) {
          this.logger(JSON.stringify({
            msg: 'Policymaker for objective',
            'policy-maker': this.policymaker.constructor.name,
            ...withObjectiveIdAttribute(objective.id()),
          }));

          if (this.policymaker.shouldApprove(objective)) {
            objective = objective.approve();

            if (objective instanceof DirectDefundObjective) {
              // If we just approved a direct defund objective, destroy the consensus channel
              // to prevent it being used (a Channel will now take over governance)
              try {
                await this.store.destroyConsensusChannel(objective.c!.id);
              } catch (err) {
                return [new EngineEvent({}), err as Error];
              }
            }
          } else {
            let sideEffects: SideEffects;
            [objective, sideEffects] = objective.reject();

            try {
              await this.store.setObjective(objective);
            } catch (err) {
              return [new EngineEvent({}), err as Error];
            }

            allCompleted.completedObjectives.push(objective);

            try {
              await this.executeSideEffects(sideEffects);
            } catch (err) {
              // An error would mean we failed to send a message. But the objective is still "completed".
              // So, we should return allCompleted even if there was an error.
              return [allCompleted, err as Error];
            }
          }
        }

        if (objective.getStatus() === ObjectiveStatus.Completed) {
          this.logger(JSON.stringify({
            msg: 'Ignoring payload for completed objective',
            ...withObjectiveIdAttribute(objective.id()),
          }));

          continue;
        }

        if (objective.getStatus() === ObjectiveStatus.Rejected) {
          this.logger(JSON.stringify({
            msg: 'Ignoring payload for rejected objective',
            ...withObjectiveIdAttribute(objective.id()),
          }));
          continue;
        }

        let updatedObjective: Objective;
        try {
          updatedObjective = objective.update(payload);
        } catch (err) {
          return [new EngineEvent({}), err as Error];
        }

        const [progressEvent, err] = await this.attemptProgress(updatedObjective);

        if (err) {
          return [new EngineEvent({}), err as Error];
        }

        allCompleted.merge(progressEvent);
      }

      for await (const entry of (message.ledgerProposals ?? [])) {
        // The ledger protocol requires us to process these proposals in turnNum order.
        // Here we rely on the sender having packed them into the message in that order, and do not apply any checks or sorting of our own.

        const id = getProposalObjectiveId(entry.proposal);

        let o: Objective;
        try {
          o = await this.store.getObjectiveById(id);
        } catch (err) {
          return [new EngineEvent({}), err as Error];
        }

        if (o.getStatus() === ObjectiveStatus.Completed) {
          this.logger(JSON.stringify({
            msg: 'Ignoring proposal for completed objective',
            ...withObjectiveIdAttribute(id),
          }));
          continue;
        }

        // Workaround for Go type assertion syntax
        const isProposalReceiver = 'receiveProposal' in o && typeof o.receiveProposal === 'function';
        const objective = o as ProposalReceiver;
        if (!isProposalReceiver) {
          return [new EngineEvent({}), new Error(`received a proposal for an objective which cannot receive proposals ${objective.id()}`)];
        }

        let updatedObjective: Objective;
        try {
          updatedObjective = objective.receiveProposal(entry);
        } catch (err) {
          return [new EngineEvent({}), err as Error];
        }

        const [progressEvent, err] = await this.attemptProgress(updatedObjective);

        if (err) {
          return [new EngineEvent({}), err as Error];
        }

        allCompleted.merge(progressEvent);
      }

      for await (const entry of (message.rejectedObjectives ?? [])) {
        let objective: Objective;
        try {
          objective = await this.store.getObjectiveById(entry);
        } catch (err) {
          return [new EngineEvent({}), err as Error];
        }

        if (objective.getStatus() === ObjectiveStatus.Rejected) {
          this.logger(JSON.stringify({
            msg: 'Ignoring payload for rejected objective',
            ...withObjectiveIdAttribute(objective.id()),
          }));
          continue;
        }

        // we are rejecting due to a counterparty message notifying us of their rejection. We
        // do not need to send a message back to that counterparty, and furthermore we assume that
        // counterparty has already notified all other interested parties. We can therefore ignore the side effects
        [objective] = objective.reject();
        try {
          await this.store.setObjective(objective);
        } catch (err) {
          return [new EngineEvent({}), err as Error];
        }

        allCompleted.completedObjectives.push(objective);
      }

      for await (const voucher of (message.payments ?? [])) {
        try {
          // TODO: return the amount we paid?
          await this.vm.receive(voucher);
        } catch (err) {
          return [new EngineEvent({}), new WrappedError('error accepting payment voucher', err as Error)];
        } finally {
          allCompleted.receivedVouchers.push(voucher);
        }

        const [c, ok] = await this.store.getChannelById(voucher.channelId);
        if (!ok) {
          return [new EngineEvent({}), new Error(`could not fetch channel for voucher ${voucher}`)];
        }

        // Vouchers only count as payment channel updates if the channel is open.
        if (!c.finalCompleted()) {
          let paid: bigint | undefined;
          let remaining: bigint | undefined;
          try {
            [paid, remaining] = await getVoucherBalance(c.id, this.vm);
          } catch (err) {
            return [new EngineEvent({}), err as Error];
          }

          let info: PaymentChannelInfo;
          try {
            info = constructPaymentInfo(c, paid, remaining);
          } catch (err) {
            return [new EngineEvent({}), err as Error];
          }

          allCompleted.paymentChannelUpdates.push(info);
        }
      }

      return [allCompleted, null];
    } finally {
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // handleChainEvent handles a Chain Event from the blockchain.
  // It:
  //   - reads an objective from the store,
  //   - generates an updated objective, and
  //   - attempts progress.
  private async handleChainEvent(chainEvent: ChainEvent): Promise<[EngineEvent, Error | null]> {
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.handleChainEvent.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      assert('string' in chainEvent && typeof chainEvent.string === 'function');
      this.logger(JSONbigNative.stringify({
        msg: 'handling chain event',
        blockNum: chainEvent.blockNum(),
        event: chainEvent.string(),
      }));

      try {
        await this.store!.setLastBlockNumSeen(chainEvent.blockNum());
      } catch (err) {
        return [new EngineEvent({}), err as Error];
      }

      // eslint-disable-next-line prefer-const
      let [c, ok] = await this.store!.getChannelById(chainEvent.channelID());

      if (!ok) {
        // TODO: Right now the chain service returns chain events for ALL channels even those we aren't involved in
        // for now we can ignore channels we aren't involved in
        // in the future the chain service should allow us to register for specific channels
        return [new EngineEvent({}), null];
      }

      let updateChannel: channel.Channel;
      try {
        updateChannel = c.updateWithChainEvent(chainEvent);
      } catch (err) {
        return [new EngineEvent({}), err as Error];
      }

      try {
        await this.store!.setChannel(updateChannel);
      } catch (err) {
        return [new EngineEvent({}), err as Error];
      }

      let objective: Objective | undefined;
      // eslint-disable-next-line prefer-const
      [objective, ok] = await this.store!.getObjectiveByChannelId(chainEvent.channelID());
      assert(objective);

      if (ok) {
        return await this.attemptProgress(objective);
      }

      return [new EngineEvent({}), null];
    } finally {
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // handleObjectiveRequest handles an ObjectiveRequest (triggered by a client API call).
  // It will attempt to spawn a new, approved objective.
  private async handleObjectiveRequest(or: ObjectiveRequest): Promise<[EngineEvent, Error | null]> {
    let deferredSignalObjectiveStarted;
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.handleObjectiveRequest.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      assert(this.store);
      assert(this.chain);
      assert(this.logger);

      const myAddress = this.store.getAddress();

      let chainId: bigint;
      try {
        chainId = await this.chain.getChainId();
      } catch (err) {
        return [new EngineEvent({}), new WrappedError('could not get chain id from chain service', err as Error)];
      }

      const objectiveId = or.id(myAddress, chainId);

      const failedEngineEvent = new EngineEvent({ failedObjectives: [objectiveId] });
      this.logger(JSON.stringify({
        msg: 'handling new objective request',
        ...withObjectiveIdAttribute(objectiveId),
      }));
      // Need to pass objective id instead of objective request id
      // this.metrics!.recordObjectiveStarted(objectiveId);

      deferredSignalObjectiveStarted = () => or.signalObjectiveStarted();

      switch (true) {
        case or instanceof VirtualFundObjectiveRequest: {
          let vfo: VirtualFundObjective;
          try {
            vfo = await VirtualFundObjective.newObjective(
              or as VirtualFundObjectiveRequest,
              true,
              myAddress,
              chainId,
              this.store.getConsensusChannel.bind(this.store),
            );
          } catch (err) {
            return [failedEngineEvent, new WrappedError(`handleAPIEvent: Could not create virtualfund objective for ${or}`, err as Error)];
          }

          if (METRICS_ENABLED) {
            this.metrics!.recordObjectiveStarted(vfo.id());
          }

          // Only Alice or Bob care about registering the objective and keeping track of vouchers
          const lastParticipant = BigInt((vfo.v!.participants ?? []).length - 1);
          if (vfo.myRole === lastParticipant || vfo.myRole === BigInt(PAYER_INDEX)) {
            try {
              await this.registerPaymentChannel(vfo);
            } catch (objectiveErr) {
              const err = objectiveErr as Error;
              return [
                failedEngineEvent,
                new WrappedError(
                  'could not register channel with payment/receipt manager',
                  err,
                )];
            }
          }

          return await this.attemptProgress(vfo);
        }

        case or instanceof VirtualDefundObjectiveRequest: {
          let minAmount: bigint | undefined = BigInt(0);
          const request = or as VirtualDefundObjectiveRequest;

          if (await this.vm!.channelRegistered(request.channelId)) {
            try {
              const paid = await this.vm!.paid(request.channelId);

              minAmount = paid;
            } catch (err) {
              return [
                failedEngineEvent,
                new WrappedError(
                  `handleAPIEvent: Could not create virtualdefund objective for ${JSONbigNative.stringify(request)}`,
                  err as Error,
                ),
              ];
            }
          }

          let vdfo: VirtualDefundObjective;
          try {
            vdfo = await VirtualDefundObjective.newObjective(
              request,
              true,
              myAddress,
              minAmount,
              this.store.getChannelById.bind(this.store),
              this.store.getConsensusChannel.bind(this.store),
            );

            if (METRICS_ENABLED) {
              this.metrics!.recordObjectiveStarted(vdfo.id());
            }
          } catch (err) {
            return [
              failedEngineEvent,
              new WrappedError(
                `handleAPIEvent: Could not create virtualdefund objective for ${JSONbigNative.stringify(request)}`,
                err as Error,
              ),
            ];
          }

          return await this.attemptProgress(vdfo);
        }

        case or instanceof DirectFundObjectiveRequest: {
          let dfo: DirectFundObjective;
          try {
            dfo = await DirectFundObjective.newObjective(
              or as DirectFundObjectiveRequest,
              true,
              myAddress,
              chainId,
              this.store.getChannelsByParticipant.bind(this.store),
              this.store.getConsensusChannel.bind(this.store),
            );

            if (METRICS_ENABLED) {
              this.metrics!.recordObjectiveStarted(dfo.id());
            }
          } catch (err) {
            return [
              failedEngineEvent,
              new WrappedError(`handleAPIEvent: Could not create directfund objective for ${JSONbigNative.stringify(or)}`, err as Error),
            ];
          }

          return await this.attemptProgress(dfo);
        }

        case or instanceof DirectDefundObjectiveRequest: {
          const request = or as DirectDefundObjectiveRequest;
          let ddfo: DirectDefundObjective;
          try {
            ddfo = await DirectDefundObjective.newObjective(
              request,
              true,
              this.store.getConsensusChannelById.bind(this.store),
            );
          } catch (err) {
            return [
              failedEngineEvent,
              new WrappedError(
                `handleAPIEvent: Could not create directdefund objective for ${JSONbigNative.stringify(request)}`,
                err as Error,
              ),
            ];
          }

          if (METRICS_ENABLED) {
            this.metrics!.recordObjectiveStarted(ddfo.id());
          }
          // If ddfo creation was successful, destroy the consensus channel to prevent it being used (a Channel will now take over governance)
          try {
            await this.store.destroyConsensusChannel(request.channelId);
          } catch (err) {
            return [
              failedEngineEvent,
              new WrappedError(`handleAPIEvent: Could not destroy consensus channel for ${JSONbigNative.stringify(request)}`, err as Error),
            ];
          }

          return await this.attemptProgress(ddfo);
        }

        default:
          return [failedEngineEvent, new Error(`handleAPIEvent: Unknown objective type ${typeof or}`)];
      }
    } finally {
      if (deferredSignalObjectiveStarted) {
        deferredSignalObjectiveStarted();
      }
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // handlePaymentRequest handles an PaymentRequest (triggered by a client API call).
  // It prepares and dispatches a payment message to the counterparty.
  private async handlePaymentRequest(request: PaymentRequest): Promise<[EngineEvent, Error | null]> {
    const ee = new EngineEvent({});

    if (_.isEqual(request, {})) {
      return [ee, new Error('handleAPIEvent: Empty payment request')];
    }

    const cId = request.channelId;
    let voucher: Voucher;
    try {
      voucher = await this.vm!.pay(cId, request.amount, this.store!.getChannelSigner());
    } catch (err) {
      return [ee, new WrappedError('handleAPIEvent: Error making payment', err as Error)];
    }

    const [c, ok] = await this.store!.getChannelById(cId);

    if (!ok) {
      return [ee, new Error(`handleAPIEvent: Could not get channel from the store ${cId}`)];
    }

    const payer = getPayer(c.participants);
    const payee = getPayee(c.participants);

    if (payer !== this.store!.getAddress()) {
      return [ee, new Error(`handleAPIEvent: Not the sender in channel ${cId}`)];
    }

    let info: PaymentChannelInfo;
    try {
      info = await getPaymentChannelInfo(cId, this.store!, this.vm!);
    } catch (err) {
      return [ee, new WrappedError('handleAPIEvent: Error querying channel info', err as Error)];
    }

    ee.paymentChannelUpdates = [...ee.paymentChannelUpdates, info];

    const se = new SideEffects({
      messagesToSend: Message.createVoucherMessage(voucher, payee),
    });

    try {
      await this.executeSideEffects(se);
    } catch (err) {
      return [ee, err as Error];
    }

    this._sentVouchers?.push(voucher);
    return [ee, null];
  }

  // sendMessages sends out the messages and records the metrics.
  private async sendMessages(msgs: Message[]): Promise<void> {
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.sendMessages.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      assert(this.store);
      assert(this.msg);
      for await (const message of msgs) {
        message.from = this.store.getAddress();

        if (METRICS_ENABLED) {
          this.recordMessageMetrics(message);
        }
        try {
          await this.msg.send(message);
        } catch (err) {
          this.logger(err);
          throw err;
        }

        this.logMessage(message, Outgoing);
      }
    } finally {
      this.wg!.done();
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // executeSideEffects executes the SideEffects declared by cranking an Objective or handling a payment request.
  private async executeSideEffects(sideEffects: SideEffects): Promise<void> {
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.executeSideEffects.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      this.wg!.add(1);
      // Send messages in a go routine so that we don't block on message delivery
      go(this.sendMessages.bind(this), sideEffects.messagesToSend);

      assert(this.chain);
      for await (const tx of sideEffects.transactionsToSubmit) {
        this.logger(JSON.stringify({
          msg: 'Sending chain transaction',
          channel: tx.channelId().string(),
        }));
        await this.chain.sendTransaction(tx);
      }

      assert(this.fromLedger);
      for await (const proposal of sideEffects.proposalsToProcess) {
        await this.fromLedger.push(proposal);
      }
    } finally {
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // attemptProgress takes a "live" objective in memory and performs the following actions:
  //
  //  1. It pulls the secret key from the store
  //  2. It cranks the objective with that key
  //  3. It commits the cranked objective to the store
  //  4. It executes any side effects that were declared during cranking
  //  5. It updates progress metadata in the store
  private async attemptProgress(objective: Objective): Promise<[EngineEvent, Error | null]> {
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.attemptProgress.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      const outgoing = new EngineEvent({});

      assert(this.store);
      const signer = this.store.getChannelSigner();

      let crankedObjective: Objective;
      let sideEffects: SideEffects;
      let waitingFor: string;

      try {
        [crankedObjective, sideEffects, waitingFor] = await objective.crank(signer);
      } catch (err) {
        return [outgoing, err as Error];
      }

      try {
        await this.store.setObjective(crankedObjective);
      } catch (err) {
        return [new EngineEvent({}), err as Error];
      }

      let notifEvents: EngineEvent;
      try {
        notifEvents = await this.generateNotifications(crankedObjective);
      } catch (err) {
        return [new EngineEvent({}), err as Error];
      }

      outgoing.merge(notifEvents);

      this.logger(JSON.stringify({
        msg: 'Objective cranked',
        ...withObjectiveIdAttribute(objective.id()),
        'waiting-for': waitingFor,

      }));

      // If our protocol is waiting for nothing then we know the objective is complete
      // TODO: If attemptProgress is called on a completed objective CompletedObjectives would include that objective id
      // Probably should have a better check that only adds it to CompletedObjectives if it was completed in this crank
      if (waitingFor === 'WaitingForNothing') {
        outgoing.completedObjectives = outgoing.completedObjectives.concat(crankedObjective);
        try {
          await this.store.releaseChannelFromOwnership(crankedObjective.ownsChannel());
        } catch (err) {
          return [outgoing, err as Error];
        }

        try {
          await this.spawnConsensusChannelIfDirectFundObjective(crankedObjective);
        } catch (err) {
          return [outgoing, err as Error];
        }
      }

      try {
        await this.executeSideEffects(sideEffects);
      } catch (err) {
        return [outgoing, err as Error];
      }

      return [outgoing, null];
    } finally {
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // generateNotifications takes an objective and constructs notifications for any related channels for that objective.
  private async generateNotifications(o: Objective): Promise<EngineEvent> {
    const outgoing = new EngineEvent({});

    for await (const rel of o.related()) {
      switch (rel.constructor) {
        case VirtualChannel: {
          let paid: bigint | undefined;
          let remaining: bigint | undefined;
          const vc = rel as VirtualChannel;

          if (!vc.finalCompleted()) {
            // If the channel is open, we inspect vouchers for that channel to get the future resolvable balance
            [paid, remaining] = await getVoucherBalance(vc.id, this.vm!);
          } else {
            // If the channel is closed, vouchers have already been resolved.
            // Note that when virtual defunding, this information may in fact be more up to date than
            // the voucher balance due to a race condition https://github.com/statechannels/go-nitro/issues/1323
            [paid, remaining] = vc.getPaidAndRemaining();
          }

          const info = constructPaymentInfo(vc, paid, remaining);
          outgoing.paymentChannelUpdates.push(info);

          break;
        }

        case channel.Channel: {
          const c = rel as channel.Channel;
          const l = constructLedgerInfoFromChannel(c, this.store!.getAddress());
          outgoing.ledgerChannelUpdates.push(l);

          break;
        }

        case ConsensusChannel: {
          const c = rel as ConsensusChannel;
          const l = constructLedgerInfoFromConsensus(c, this.store!.getAddress());
          outgoing.ledgerChannelUpdates.push(l);

          break;
        }

        default: {
          throw new Error(`handleNotifications: Unknown related type ${rel.constructor}`);
        }
      }
    }

    return outgoing;
  }

  private async registerPaymentChannel(vfo: VirtualFundObjective): Promise<void> {
    assert(vfo.v);
    const postfund = vfo.v.postFundState();
    let startingBalance: bigint = BigInt(0);

    // TODO: Assumes one asset for now
    startingBalance = BigInt(postfund.outcome.value![0].allocations.value![0].amount!);

    assert(this.vm);

    return this.vm.register(
      vfo.v.id,
      getPayer(postfund.participants),
      getPayee(postfund.participants),
      startingBalance,
    );
  }

  // spawnConsensusChannelIfDirectFundObjective will attempt to create and store a ConsensusChannel derived from
  // the supplied Objective if it is a directfund.Objective.
  //
  // The associated Channel will remain in the store.
  private async spawnConsensusChannelIfDirectFundObjective(crankedObjective: Objective): Promise<void> {
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.spawnConsensusChannelIfDirectFundObjective.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      if (crankedObjective instanceof DirectFundObjective) {
        const dfo = crankedObjective as DirectFundObjective;
        let c: ConsensusChannel;
        assert(this.store);

        try {
          c = dfo.createConsensusChannel();
        } catch (err) {
          throw new WrappedError(
            `could not create consensus channel for objective ${crankedObjective.id()}`,
            err as Error,
          );
        }

        try {
          await this.store.setConsensusChannel(c);
        } catch (err) {
          throw new WrappedError(
            `could not store consensus channel for objective ${crankedObjective.id()}`,
            err as Error,
          );
        }

        try {
          // Destroy the channel since the consensus channel takes over governance:
          await this.store.destroyChannel(c.id);
        } catch (err) {
          throw new WrappedError(
            `Could not destroy consensus channel for objective ${crankedObjective.id()}`,
            err as Error,
          );
        }
      }
    } finally {
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // getOrCreateObjective retrieves the objective from the store.
  // If the objective does not exist, it creates the objective using the supplied payload and stores it in the store
  private async getOrCreateObjective(p: ObjectivePayload): Promise<Objective> {
    let deferredCompleteRecordFunction;
    try {
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.getOrCreateObjective.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      assert(this.store);

      const id = p.objectiveId;

      try {
        const objective = await this.store.getObjectiveById(id);
        return objective;
      } catch (err) {
        if ((err as Error).message.includes(ErrNoSuchObjective.message)) {
          let newObj: Objective;
          try {
            newObj = await this.constructObjectiveFromMessage(id, p);
          } catch (constructErr) {
            throw new WrappedError('error constructing objective from message', constructErr as Error);
          }

          if (METRICS_ENABLED) {
            this.metrics!.recordObjectiveStarted(newObj.id());
          }

          try {
            await this.store.setObjective(newObj);
          } catch (setErr) {
            throw new WrappedError('error setting objective in store', setErr as Error);
          }

          this.logger(JSON.stringify({
            msg: 'Created new objective from message',
            id: newObj.id(),
          }));
          return newObj;
        }

        /* eslint-disable @typescript-eslint/no-throw-literal */
        throw new ErrGetObjective({ wrappedError: err as Error, objectiveId: id });
      }
    } finally {
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // constructObjectiveFromMessage Constructs a new objective (of the appropriate concrete type) from the supplied payload.
  private async constructObjectiveFromMessage(id: ObjectiveId, p: ObjectivePayload): Promise<Objective> {
    let deferredCompleteRecordFunction;
    try {
      this.logger(JSON.stringify({
        msg: 'Constructing objective from message',
        ...withObjectiveIdAttribute(id),
      }));
      if (METRICS_ENABLED) {
        const completeRecordFunction = this.metrics!.recordFunctionDuration(this.constructObjectiveFromMessage.name);
        deferredCompleteRecordFunction = () => completeRecordFunction();
      }

      assert(this.store);
      assert(this.vm);

      switch (true) {
        case isDirectFundObjective(id): {
          const dfo = DirectFundObjective.constructFromPayload(false, p, this.store.getAddress());
          return dfo;
        }
        case isVirtualFundObjective(id): {
          let vfo: VirtualFundObjective;
          try {
            vfo = await VirtualFundObjective.constructObjectiveFromPayload(
              p,
              false,
              this.store.getAddress(),
              this.store.getConsensusChannel.bind(this.store),
            );
          } catch (err) {
            throw fromMsgErr(id, err as Error);
          }

          try {
            await this.registerPaymentChannel(vfo);
          } catch (err) {
            throw new WrappedError(
              `could not register channel with payment/receipt manager.\n\ttarget channel: ${id}\n\terr`,
              err as Error,
            );
          }

          return vfo;
        }
        case isVirtualDefundObjective(id): {
          let vId: Destination;
          try {
            vId = getVirtualChannelFromObjectiveId(id);
          } catch (err) {
            throw new WrappedError(`could not determine virtual channel id from objective ${id}`, err as Error);
          }

          let minAmount: bigint | undefined = BigInt(0);
          if (await this.vm.channelRegistered(vId)) {
            let paid: bigint | undefined;
            try {
              paid = await this.vm.paid(vId);
            } catch (err) {
              throw new WrappedError(`could not determine virtual channel id from objective ${id}`, err as Error);
            }

            minAmount = paid;
          }

          let vdfo: VirtualDefundObjective;
          try {
            vdfo = await VirtualDefundObjective.constructObjectiveFromPayload(
              p,
              false,
              this.store.getAddress(),
              this.store.getChannelById.bind(this.store),
              this.store.getConsensusChannel.bind(this.store),
              minAmount,
            );
          } catch (err) {
            throw fromMsgErr(id, err as Error);
          }

          return vdfo;
        }
        case isDirectDefundObjective(id): {
          let ddfo: DirectDefundObjective;
          try {
            ddfo = await DirectDefundObjective.constructObjectiveFromPayload(
              p,
              false,
              this.store.getConsensusChannelById.bind(this.store),
            );
          } catch (err) {
            throw fromMsgErr(id, err as Error);
          }

          return ddfo;
        }
        default:
          throw new Error('cannot handle unimplemented objective type');
      }
    } finally {
      if (deferredCompleteRecordFunction) {
        deferredCompleteRecordFunction();
      }
    }
  }

  // GetConsensusAppAddress returns the address of a deployed ConsensusApp (for ledger channels)
  getConsensusAppAddress(): Address {
    assert(this.chain);
    return this.chain.getConsensusAppAddress();
  }

  // GetVirtualPaymentAppAddress returns the address of a deployed VirtualPaymentApp
  getVirtualPaymentAppAddress(): Address {
    assert(this.chain);
    return this.chain.getVirtualPaymentAppAddress();
  }

  // logMessage logs a message to the engine's logger
  private logMessage(msg: Message, direction: MessageDirection): void {
    if (direction === Incoming) {
      this.logger(JSONbigNative.stringify({
        msg: 'Received message',
        _msg: msg.summarize(),
      }));
    } else {
      this.logger(JSONbigNative.stringify({
        msg: 'Sent message',
        _msg: msg.summarize(),
      }));
    }
  }

  // recordMessageMetrics records metrics for a message
  private recordMessageMetrics(message: Message): void {
    this.metrics!.recordQueueLength(
      `msg_proposal_count,sender=${this.store?.getAddress()},receiver=${message.to}`,
      (message.ledgerProposals ?? []).length,
    );
    this.metrics!.recordQueueLength(
      `msg_payment_count,sender=${this.store?.getAddress()},receiver=${message.to}`,
      (message.payments ?? []).length,
    );
    this.metrics!.recordQueueLength(
      `msg_payload_count,sender=${this.store?.getAddress()},receiver=${message.to}`,
      (message.objectivePayloads ?? []).length,
    );

    let totalPayloadsSize = 0;
    for (const p of (message.objectivePayloads ?? [])) {
      totalPayloadsSize += p.payloadData.length;
    }

    const raw = message.serialize();
    this.metrics!.recordQueueLength(`msg_payload_size,sender=${this.store?.getAddress()},receiver=${message.to}`, totalPayloadsSize);
    this.metrics!.recordQueueLength(`msg_size,sender=${this.store?.getAddress()},receiver=${message.to}`, raw.length);
  }

  // eslint-disable-next-line n/handle-callback-err
  private async checkError(err: Error): Promise<void> {
    if (err) {
      this.logger(JSON.stringify({
        msg: 'error in run loop',
        err: (err as Error).message,
      }));

      for (const nonFatalError of nonFatalErrors) {
        if (WrappedError.is(err, nonFatalError)) {
          return;
        }
      }

      throw err;
    }
  }
}

type MessageDirection = string;

// fromMsgErr wraps errors from objective construction functions and
// returns an error bundled with the objectiveID
function fromMsgErr(id: ObjectiveId, err: Error): Error {
  return new WrappedError(`could not create objective from message.\n\ttarget objective: ${id}\n\terr`, err as Error);
}

// getProposalObjectiveId returns the objectiveId for a proposal.
function getProposalObjectiveId(p: Proposal): ObjectiveId {
  switch (p.type()) {
    case ProposalType.AddProposal: {
      const prefix = VirtualFundObjectivePrefix;
      const channelId = p.toAdd.target().string();
      return `${prefix}${channelId}`;
    }
    case ProposalType.RemoveProposal: {
      const prefix = VirtualDefundObjectivePrefix;
      const channelId = p.toRemove.target.string();
      return `${prefix}${channelId}`;
    }
    default:
      throw new Error('invalid proposal type');
  }
}

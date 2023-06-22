/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-use-before-define */

import debug from 'debug';
import assert from 'assert';
import _ from 'lodash';

import Channel from '@nodeguy/channel';
import type { ReadChannel, ReadWriteChannel } from '@nodeguy/channel';
import { JSONbigNative, go } from '@cerc-io/nitro-util';

import { MessageService } from './messageservice/messageservice';
import { ChainService, ChainEvent, ChainEventHandler } from './chainservice/chainservice';
import { ErrNoSuchObjective, Store } from './store/store';
import { PolicyMaker } from './policy-maker';
import { MetricsApi, MetricsRecorder, NoOpMetrics } from './metrics';
import { VoucherManager } from '../../payments/voucher-manager';
import {
  Objective, ObjectiveRequest, ObjectiveStatus, ProposalReceiver, SideEffects, WaitingFor,
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

const log = debug('ts-nitro:engine');

class ErrUnhandledChainEvent extends Error {
  event?: ChainEvent;

  objective?: Objective;

  reason: string = '';

  constructor(params: {
    event?: ChainEvent,
    objective?: Objective,
    reason?: string
  }) {
    super(`Chain event ${params.event} could not be handled by objective ${params.objective} due to: ${params.reason ?? ''}`);
    Object.assign(this);
  }
}

const Incoming: MessageDirection = 'Incoming';
const Outgoing: MessageDirection = 'Outgoing';

export type PaymentRequest = {
  channelId: Destination
  amount: bigint
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

class ErrGetObjective {
  wrappedError: Error = new Error();

  objectiveId?: ObjectiveId;

  constructor(params: { wrappedError?: Error, objectiveId?: ObjectiveId }) {
    Object.assign(this, params);
  }

  error(): string {
    return `unexpected error getting/creating objective ${this.objectiveId}: ${this.wrappedError}`;
  }
}

// nonFatalErrors is a list of errors for which the engine should not panic
const nonFatalErrors: ErrGetObjective[] = [];

export class Engine {
  objectiveRequestsFromAPI?: ReadWriteChannel<ObjectiveRequest>;

  paymentRequestsFromAPI?: ReadWriteChannel<PaymentRequest>;

  private fromChain?: ReadChannel<ChainEvent>;

  private fromMsg?: ReadChannel<Message>;

  private fromLedger?: ReadWriteChannel<Proposal>;

  private _toApi?: ReadWriteChannel<EngineEvent>;

  private stop?: ReadWriteChannel<void>;

  private msg?: MessageService;

  private chain?: ChainService;

  // A Store for persisting and restoring important data
  private store?: Store;

  // A PolicyMaker decides whether to approve or reject objectives
  private policymaker?: PolicyMaker;

  private logger: debug.Debugger = log;

  private metrics?: MetricsRecorder;

  private vm?: VoucherManager;

  static new(
    vm: VoucherManager,
    msg: MessageService,
    chain: ChainService,
    store: Store,
    logDestination: WritableStream | undefined,
    policymaker: PolicyMaker,
    metricsApi?: MetricsApi,
  ) {
    const e = new Engine();
    e.store = store;

    e.fromLedger = Channel<Proposal>(100);
    // bind to inbound channels
    e.objectiveRequestsFromAPI = Channel<ObjectiveRequest>();
    e.paymentRequestsFromAPI = Channel<PaymentRequest>();
    e.stop = Channel();

    e.fromChain = chain.eventFeed();
    e.fromMsg = msg.out();

    e.chain = chain;
    e.msg = msg;

    e._toApi = Channel<EngineEvent>(100);

    e.policymaker = policymaker;

    e.vm = vm;

    e.logger('Constructed Engine');

    if (!metricsApi) {
      // eslint-disable-next-line no-param-reassign
      metricsApi = new NoOpMetrics();
    }
    e.metrics = new MetricsRecorder();

    return e;
  }

  get toApi(): ReadChannel<EngineEvent> {
    assert(this._toApi);
    return this._toApi.readOnly();
  }

  // TODO: Can throw an error
  close(): void {}

  // Run kicks of an infinite loop that waits for communications on the supplied channels, and handles them accordingly
  // The loop exits when a struct is received on the stop channel. Engine.Close() sends that signal.
  async run(): Promise<void> {
    assert(this.objectiveRequestsFromAPI);
    assert(this.paymentRequestsFromAPI);
    assert(this.fromChain);
    assert(this.fromMsg);
    assert(this.fromLedger);
    assert(this.stop);
    assert(this._toApi);

    // TODO: Implement metrics

    while (true) {
      let res = new EngineEvent();

      try {
        /* eslint-disable no-await-in-loop */
        /* eslint-disable default-case */
        switch (await Channel.select([
          this.objectiveRequestsFromAPI.shift(),
          this.paymentRequestsFromAPI.shift(),
          this.fromChain.shift(),
          this.fromMsg.shift(),
          this.fromLedger.shift(),
          this.stop.shift(),
        ])) {
          case this.objectiveRequestsFromAPI:
            res = await this.handleObjectiveRequest(this.objectiveRequestsFromAPI.value());
            break;

          case this.paymentRequestsFromAPI:
            res = await this.handlePaymentRequest(this.paymentRequestsFromAPI.value());
            break;

          case this.fromChain:
            res = await this.handleChainEvent(this.fromChain.value());
            break;

          case this.fromMsg: {
            let err: Error | undefined;
            [res, err] = await this.handleMessage(this.fromMsg.value());

            if (err) {
              throw err;
            }

            break;
            // TODO: Return errors from other handlers as well?
          }
          case this.fromLedger:
            res = await this.handleProposal(this.fromLedger.value());
            break;

          case this.stop:
            return;
        }
      } catch (err) {
        // Handle errors
        this.checkError(err as Error);
      }

      // Only send out an event if there are changes
      if (!res.isEmpty()) {
        res.completedObjectives?.forEach((obj) => {
          assert(this.logger);
          this.logger(`Objective ${obj.id()} is complete & returned to API`);
          // TODO: Implement metrics
          // e.metrics.RecordObjectiveCompleted(obj.Id())
        });

        await this._toApi.push(res);
      }
    }
  }

  // handleProposal handles a Proposal returned to the engine from
  // a running ledger channel by pulling its corresponding objective
  // from the store and attempting progress.
  private async handleProposal(proposal: Proposal): Promise<EngineEvent> {
    assert(this.store);

    // TODO: Implement metrics
    // defer e.metrics.RecordFunctionDuration()()

    const id = getProposalObjectiveId(proposal);
    const obj = this.store.getObjectiveById(id);

    if (obj.getStatus() === ObjectiveStatus.Completed) {
      this.logger(`Ignoring proposal for complected objective ${obj.id()}`);
      return new EngineEvent();
    }

    return this.attemptProgress(obj);
  }

  // handleMessage handles a Message from a peer go-nitro Wallet.
  // It:
  //   - reads an objective from the store,
  //   - generates an updated objective,
  //   - attempts progress on the target Objective,
  //   - attempts progress on related objectives which may have become unblocked.
  private async handleMessage(message: Message): Promise<[EngineEvent, Error | undefined]> {
    assert(this.policymaker);
    assert(this.store);
    assert(this.vm);

    // TODO: Implement metrics
    // defer e.metrics.RecordFunctionDuration()()
    this.logMessage(message, Incoming);
    const allCompleted = new EngineEvent();

    for await (const payload of message.objectivePayloads) {
      let objective: Objective;
      try {
        objective = this.getOrCreateObjective(payload);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      if (objective.getStatus() === ObjectiveStatus.Unapproved) {
        this.logger('Policymaker is', this.policymaker.constructor.name);

        if (this.policymaker.shouldApprove(objective)) {
          objective = objective.approve();

          if (objective instanceof DirectDefundObjective) {
            // If we just approved a direct defund objective, destroy the consensus channel
            // to prevent it being used (a Channel will now take over governance)
            this.store.destroyConsensusChannel(objective.c!.id);
          }
        } else {
          let sideEffects: SideEffects;
          [objective, sideEffects] = objective.reject();

          try {
            this.store.setObjective(objective);
          } catch (err) {
            return [new EngineEvent(), err as Error];
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
        this.logger(`Ignoring payload for complected objective ${objective.id()}`);
        continue;
      }

      if (objective.getStatus() === ObjectiveStatus.Rejected) {
        this.logger(`Ignoring payload for rejected objective ${objective.id()}`);
        continue;
      }

      let updatedObjective: Objective;
      try {
        updatedObjective = objective.update(payload);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      let progressEvent: EngineEvent;
      try {
        progressEvent = await this.attemptProgress(updatedObjective);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      allCompleted.merge(progressEvent);
    }

    for await (const entry of message.ledgerProposals) {
      // The ledger protocol requires us to process these proposals in turnNum order.
      // Here we rely on the sender having packed them into the message in that order, and do not apply any checks or sorting of our own.

      const id = getProposalObjectiveId(entry.proposal);

      let o: Objective;
      try {
        o = this.store.getObjectiveById(id);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      if (o.getStatus() === ObjectiveStatus.Completed) {
        this.logger(`Ignoring payload for complected objective ${o.id()}`);
        continue;
      }

      // Workaround for Go type assertion syntax
      const isProposalReceiver = 'receiveProposal' in o && typeof o.receiveProposal === 'function';
      const objective = o as ProposalReceiver;
      if (!isProposalReceiver) {
        return [new EngineEvent(), new Error(`received a proposal for an objective which cannot receive proposals ${objective.id()}`)];
      }

      let updatedObjective: Objective;
      try {
        // TODO: Implement for all protocols
        updatedObjective = objective.receiveProposal(entry);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      let progressEvent: EngineEvent;
      try {
        progressEvent = await this.attemptProgress(updatedObjective);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      allCompleted.merge(progressEvent);
    }

    for (const entry of message.rejectedObjectives) {
      let objective: Objective;
      try {
        objective = this.store.getObjectiveById(entry);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      if (objective.getStatus() === ObjectiveStatus.Rejected) {
        this.logger(`Ignoring payload for rejected objective ${objective.id()}`);
        continue;
      }

      // we are rejecting due to a counterparty message notifying us of their rejection. We
      // do not need to send a message back to that counterparty, and furthermore we assume that
      // counterparty has already notified all other interested parties. We can therefore ignore the side effects
      [objective] = objective.reject();
      try {
        this.store.setObjective(objective);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      allCompleted.completedObjectives.push(objective);
    }

    for (const voucher of message.payments) {
      try {
        // TODO: return the amount we paid?
        this.vm.receive(voucher);
      } catch (err) {
        return [new EngineEvent(), new Error(`error accepting payment voucher: ${err}`)];
      } finally {
        // TODO: Check correctness
        allCompleted.receivedVouchers.push(voucher);
      }

      const [c, ok] = this.store.getChannelById(voucher.channelId);
      if (!ok) {
        return [new EngineEvent(), new Error(`could not fetch channel for voucher ${voucher}`)];
      }

      let paid: bigint;
      let remaining: bigint;
      try {
        [paid, remaining] = getVoucherBalance(c.id, this.vm);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      let info: PaymentChannelInfo;
      try {
        info = constructPaymentInfo(c, paid, remaining);
      } catch (err) {
        return [new EngineEvent(), err as Error];
      }

      allCompleted.paymentChannelUpdates.push(info);
    }

    return [allCompleted, undefined];
  }

  // handleChainEvent handles a Chain Event from the blockchain.
  // It:
  //   - reads an objective from the store,
  //   - generates an updated objective, and
  //   - attempts progress.
  private async handleChainEvent(chainEvent: ChainEvent): Promise<EngineEvent> {
    // TODO: Implement metrics
    assert('string' in chainEvent && typeof chainEvent.string === 'function');
    this.logger(`handling chain event: ${chainEvent.string()}`);

    // eslint-disable-next-line prefer-const
    let [objective, ok] = this.store!.getObjectiveByChannelId(chainEvent.channelID());

    if (!ok) {
      // TODO: Right now the chain service returns chain events for ALL channels even those we aren't involved in
      // for now we can ignore channels we aren't involved in
      // in the future the chain service should allow us to register for specific channels
      return new EngineEvent();
    }

    // Workaround for Go type assertion syntax
    assert(objective);
    ok = 'updateWithChainEvent' in objective && typeof objective.updateWithChainEvent === 'function';
    const eventHandler = objective as unknown as ChainEventHandler;
    if (!ok) {
      throw new ErrUnhandledChainEvent({
        event: chainEvent,
        objective,
        reason: 'objective does not handle chain events',
      });
    }

    const updatedEventHandler = eventHandler.updateWithChainEvent(chainEvent);

    return this.attemptProgress(updatedEventHandler);
  }

  // handleObjectiveRequest handles an ObjectiveRequest (triggered by a client API call).
  // It will attempt to spawn a new, approved objective.
  // TODO: Can throw an error
  private async handleObjectiveRequest(or: ObjectiveRequest): Promise<EngineEvent> {
    let deferredSignalObjectiveStarted;

    try {
      assert(this.store);
      assert(this.chain);
      assert(this.logger);

      // TODO: Implement metrics
      // defer e.metrics.RecordFunctionDuration()()

      const myAddress = this.store.getAddress();

      let chainId: bigint;
      try {
        chainId = await this.chain.getChainId();
      } catch (err) {
        throw new Error(`could get chain id from chain service: ${err}`);
      }

      const objectiveId = or.id(myAddress, chainId);
      this.logger(`handling new objective request for ${objectiveId}`);

      // TODO: Implement metrics
      // e.metrics.RecordObjectiveStarted(objectiveId);

      deferredSignalObjectiveStarted = () => or.signalObjectiveStarted();

      switch (true) {
        case or instanceof VirtualFundObjectiveRequest: {
          let vfo: VirtualFundObjective;
          try {
            vfo = VirtualFundObjective.newObjective(
              or as VirtualFundObjectiveRequest,
              true,
              myAddress,
              chainId,
              this.store.getConsensusChannel.bind(this.store),
            );
          } catch (err) {
            throw new Error(`handleAPIEvent: Could not create objective for ${or}: ${err}`);
          }

          // Only Alice or Bob care about registering the objective and keeping track of vouchers
          const lastParticipant = vfo.v!.participants.length - 1;
          if (vfo.myRole === lastParticipant || vfo.myRole === PAYER_INDEX) {
            try {
              this.registerPaymentChannel(vfo);
            } catch (err) {
              throw new Error(`could not register channel with payment/receipt manager: ${err}`);
            }
          }

          return await this.attemptProgress(vfo);
        }

        case or instanceof VirtualDefundObjectiveRequest: {
          let minAmount = BigInt(0);
          const request = or as VirtualDefundObjectiveRequest;

          if (this.vm!.channelRegistered(request.channelId)) {
            try {
              const paid = this.vm!.paid(request.channelId);

              minAmount = paid;
            } catch (err) {
              throw new Error(`handleAPIEvent: Could not create objective for ${JSONbigNative.stringify(request)}: ${err}`);
            }
          }

          try {
            const vdfo = VirtualDefundObjective.newObjective(
              request,
              true,
              myAddress,
              minAmount,
              this.store.getChannelById.bind(this.store),
              this.store.getConsensusChannel.bind(this.store),
            );

            return await this.attemptProgress(vdfo);
          } catch (err) {
            throw new Error(`handleAPIEvent: Could not create objective for ${request}: ${err}`);
          }
        }

        case or instanceof DirectFundObjectiveRequest:
          try {
            const dfo = DirectFundObjective.newObjective(
              or as DirectFundObjectiveRequest,
              true,
              myAddress,
              chainId,
              this.store.getChannelsByParticipant.bind(this.store),
              this.store.getConsensusChannel.bind(this.store),
            );

            return await this.attemptProgress(dfo);
          } catch (err) {
            throw new Error(`handleAPIEvent: Could not create objective for ${JSONbigNative.stringify(or)}: ${err}`);
          }

        case or instanceof DirectDefundObjectiveRequest: {
          const request = or as DirectDefundObjectiveRequest;
          let ddfo: DirectDefundObjective;
          try {
            ddfo = DirectDefundObjective.newObjective(
              request,
              true,
              this.store.getConsensusChannelById.bind(this.store),
            );
          } catch (err) {
            throw new Error(`handleAPIEvent: Could not create objective for ${JSONbigNative.stringify(request)}: ${err}`);
          }
          // If ddfo creation was successful, destroy the consensus channel to prevent it being used (a Channel will now take over governance)
          this.store.destroyConsensusChannel(request.channelId);
          return await this.attemptProgress(ddfo);
        }

        default:
          throw new Error(`handleAPIEvent: Unknown objective type ${typeof or}`);
      }
    } finally {
      if (deferredSignalObjectiveStarted) {
        deferredSignalObjectiveStarted();
      }
    }
  }

  // handlePaymentRequest handles an PaymentRequest (triggered by a client API call).
  // It prepares and dispatches a payment message to the counterparty.
  private async handlePaymentRequest(request: PaymentRequest): Promise<EngineEvent> {
    const ee = new EngineEvent();

    if (_.isEqual(request, {})) {
      throw new Error('handleAPIEvent: Empty payment request');
    }

    const cId = request.channelId;
    let voucher: Voucher;
    try {
      voucher = this.vm!.pay(cId, request.amount, this.store!.getChannelSecretKey());
    } catch (err) {
      throw new Error(`handleAPIEvent: Error making payment: ${err}`);
    }

    const [c, ok] = this.store!.getChannelById(cId);

    if (!ok) {
      throw new Error(`handleAPIEvent: Could not get channel from the store ${cId}`);
    }

    const payer = getPayer(c.participants);
    const payee = getPayee(c.participants);

    if (payer.toLowerCase() !== this.store!.getAddress().toLowerCase()) {
      throw new Error(`handleAPIEvent: Not the sender in channel ${cId}`);
    }

    let info: PaymentChannelInfo;
    try {
      info = getPaymentChannelInfo(cId, this.store!, this.vm!);
    } catch (err) {
      throw new Error(`handleAPIEvent: Error querying channel info: ${err}`);
    }

    ee.paymentChannelUpdates = [...ee.paymentChannelUpdates, info];

    const se = new SideEffects({
      messagesToSend: Message.createVoucherMessage(voucher, payee),
    });

    await this.executeSideEffects(se);
    return ee;
  }

  // sendMessages sends out the messages and records the metrics.
  private async sendMessages(msgs: Message[]): Promise<void> {
    // TODO: Implement metrics
    // defer e.metrics.RecordFunctionDuration()()

    assert(this.store);
    assert(this.msg);
    for await (const message of msgs) {
      message.from = this.store.getAddress();
      this.logMessage(message, Outgoing);
      this.recordMessageMetrics(message);
      await this.msg.send(message);
    }
  }

  // executeSideEffects executes the SideEffects declared by cranking an Objective or handling a payment request.
  private async executeSideEffects(sideEffects: SideEffects): Promise<void> {
    // TODO: Implement metrics
    // defer e.metrics.RecordFunctionDuration()()

    // Send messages in a go routine so that we don't block on message delivery
    go(this.sendMessages.bind(this), sideEffects.messagesToSend);

    assert(this.chain);
    for await (const tx of sideEffects.transactionsToSubmit) {
      this.logger(`Sending chain transaction for channel ${tx.channelId().string()}`);

      await this.chain.sendTransaction(tx);
    }

    assert(this.fromLedger);
    for await (const proposal of sideEffects.proposalsToProcess) {
      await this.fromLedger.push(proposal);
    }
  }

  // attemptProgress takes a "live" objective in memory and performs the following actions:
  //
  //  1. It pulls the secret key from the store
  //  2. It cranks the objective with that key
  //  3. It commits the cranked objective to the store
  //  4. It executes any side effects that were declared during cranking
  //  5. It updates progress metadata in the store
  private async attemptProgress(objective: Objective): Promise<EngineEvent> {
    const outgoing = new EngineEvent();
    // TODO: Implement metrics
    // defer e.metrics.RecordFunctionDuration()()

    assert(this.store);
    const secretKey = this.store.getChannelSecretKey();

    let crankedObjective: Objective;
    let sideEffects: SideEffects;
    let waitingFor: WaitingFor;

    try {
      [crankedObjective, sideEffects, waitingFor] = objective.crank(secretKey);
    } catch (err) {
      return outgoing;
    }

    this.store.setObjective(crankedObjective);

    const notifEvents = this.generateNotifications(crankedObjective);

    outgoing.merge(notifEvents);

    this.logger(`Objective ${objective.id()} is ${waitingFor}`);

    // If our protocol is waiting for nothing then we know the objective is complete
    // TODO: If attemptProgress is called on a completed objective CompletedObjectives would include that objective id
    // Probably should have a better check that only adds it to CompletedObjectives if it was completed in this crank
    if (waitingFor === 'WaitingForNothing') {
      outgoing.completedObjectives = outgoing.completedObjectives.concat(crankedObjective);
      this.store.releaseChannelFromOwnership(crankedObjective.ownsChannel());

      try {
        this.spawnConsensusChannelIfDirectFundObjective(crankedObjective);
      } catch (err) {
        return outgoing;
      }
    }

    await this.executeSideEffects(sideEffects);

    return outgoing;
  }

  // generateNotifications takes an objective and constructs notifications for any related channels for that objective.
  private generateNotifications(o: Objective): EngineEvent {
    const outgoing = new EngineEvent();

    for (const rel of o.related()) {
      switch (rel.constructor) {
        case VirtualChannel: {
          const vc = rel as VirtualChannel;
          const [paid, remaining] = getVoucherBalance(vc.id, this.vm!);
          const info = constructPaymentInfo(vc, paid, remaining);
          outgoing.paymentChannelUpdates.push(info);

          break;
        }

        case channel.Channel: {
          const c = rel as channel.Channel;
          const l = constructLedgerInfoFromChannel(c);
          outgoing.ledgerChannelUpdates.push(l);

          break;
        }

        case ConsensusChannel: {
          const cc = rel as ConsensusChannel;
          const ccInfo = constructLedgerInfoFromConsensus(cc);
          outgoing.ledgerChannelUpdates.push(ccInfo);

          break;
        }

        default: {
          throw new Error(`handleNotifications: Unknown related type ${rel.constructor}`);
        }
      }
    }

    return outgoing;
  }

  private registerPaymentChannel(vfo: VirtualFundObjective): void {
    assert(vfo.v);
    const postfund = vfo.v.postFundState();

    // TODO: Assumes one asset for now
    const startingBalance = BigInt(postfund.outcome.value[0].allocations.value[0].amount);

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
  // TODO: Can throw an error
  private spawnConsensusChannelIfDirectFundObjective(crankedObjective: Objective): void {
    // TODO: Implement metrics
    // defer e.metrics.RecordFunctionDuration()()

    if (crankedObjective instanceof DirectFundObjective) {
      const dfo = crankedObjective as DirectFundObjective;
      const c: ConsensusChannel = dfo.createConsensusChannel();
      try {
        assert(this.store);
        this.store.setConsensusChannel(c);
        this.store.destroyChannel(c.id);
      } catch (err) {
        throw new Error(`Could not create, store, or destroy consensus channel for objective ${crankedObjective.id()}: ${err}`);
      }
    }
  }

  // getOrCreateObjective retrieves the objective from the store.
  // If the objective does not exist, it creates the objective using the supplied payload and stores it in the store
  private getOrCreateObjective(p: ObjectivePayload): Objective {
    assert(this.store);

    // TODO: Implement metrics
    // defer e.metrics.RecordFunctionDuration()()

    const id = p.objectiveId;

    try {
      const objective = this.store.getObjectiveById(id);
      return objective;
    } catch (err) {
      if ((err as Error).message.includes(ErrNoSuchObjective.message)) {
        let newObj: Objective;
        try {
          newObj = this.constructObjectiveFromMessage(id, p);
        } catch (constructErr) {
          throw new Error(`error constructing objective from message: ${constructErr}`);
        }

        // TODO: Implement metrics
        // e.metrics.RecordObjectiveStarted(newObj.Id())

        try {
          this.store.setObjective(newObj);
        } catch (setErr) {
          throw new Error(`error setting objective in store: ${setErr}`);
        }

        this.logger(`Created new objective from message ${newObj.id()}`);
        return newObj;
      }

      // TODO: Check working
      /* eslint-disable @typescript-eslint/no-throw-literal */
      throw new ErrGetObjective({ wrappedError: err as Error, objectiveId: id });
    }
  }

  // constructObjectiveFromMessage Constructs a new objective (of the appropriate concrete type) from the supplied payload.
  private constructObjectiveFromMessage(id: ObjectiveId, p: ObjectivePayload): Objective {
    assert(this.store);
    assert(this.vm);

    this.logger(`Constructing objective ${id} from message`);

    // TODO: Implement metrics
    // defer e.metrics.RecordFunctionDuration()()

    switch (true) {
      case isDirectFundObjective(id): {
        const dfo = DirectFundObjective.constructFromPayload(false, p, this.store.getAddress());
        return dfo;
      }
      case isVirtualFundObjective(id): {
        let vfo: VirtualFundObjective;
        try {
          vfo = VirtualFundObjective.constructObjectiveFromPayload(
            p,
            false,
            this.store.getAddress(),
            this.store.getConsensusChannel.bind(this.store),
          );
        } catch (err) {
          throw fromMsgErr(id, err as Error);
        }

        try {
          this.registerPaymentChannel(vfo);
        } catch (err) {
          throw new Error(`could not register channel with payment/receipt manager.\n\ttarget channel: ${id}\n\terr: ${err}`);
        }

        return vfo;
      }
      case isVirtualDefundObjective(id): {
        let vId: Destination;
        try {
          vId = getVirtualChannelFromObjectiveId(id);
        } catch (err) {
          throw new Error(`could not determine virtual channel id from objective ${id}: ${err}`);
        }

        let minAmount = BigInt(0);
        if (this.vm.channelRegistered(vId)) {
          let paid: bigint;
          try {
            paid = this.vm.paid(vId);
          } catch (err) {
            throw new Error(`could not determine virtual channel id from objective ${id}: ${err}`);
          }

          minAmount = paid;
        }

        let vdfo: VirtualDefundObjective;
        try {
          vdfo = VirtualDefundObjective.constructObjectiveFromPayload(
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
          // TODO: Implement
          ddfo = DirectDefundObjective.constructObjectiveFromPayload(
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
      this.logger(`Received message: ${msg.summarize()}`);
    } else {
      this.logger(`Sending message: ${msg.summarize()}`);
    }
  }

  // recordMessageMetrics records metrics for a message
  // TODO: Implement
  private recordMessageMetrics(message: Message): void {}

  // eslint-disable-next-line n/handle-callback-err
  private async checkError(err: Error): Promise<void> {
    if (err) {
      this.logger({
        error: err,
        message: `${this.store?.getAddress()}, error in run loop`,
      });

      // TODO: Implement
      // for _, nonFatalError := range nonFatalErrors {
      //   if errors.Is(err, nonFatalError) {
      //     return
      //   }
      // }

      // We wait for a bit so the previous log line has time to complete
      await new Promise((resolve) => { setTimeout(() => resolve, 1000); });

      // TODO instead of a panic, errors should be sent to the manager of the engine via a channel. At the moment,
      // the engine manager is the nitro client.
      throw err;
    }
  }
}

type MessageDirection = string;

// fromMsgErr wraps errors from objective construction functions and
// returns an error bundled with the objectiveID
function fromMsgErr(id: ObjectiveId, err: Error): Error {
  return new Error(`could not create objective from message.\n\ttarget objective: ${id}\n\terr: ${err}`);
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

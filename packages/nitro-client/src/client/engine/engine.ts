import debug from 'debug';
import assert from 'assert';
import { ethers } from 'ethers';
import JSONbig from 'json-bigint';

import Channel from '@nodeguy/channel';
import type { ReadChannel, ReadWriteChannel } from '@nodeguy/channel';

import { MessageService } from './messageservice/messageservice';
import { ChainService, ChainEvent } from './chainservice/chainservice';
import { Store } from './store/store';
import { PolicyMaker } from './policy-maker';
import { MetricsApi, MetricsRecorder, NoOpMetrics } from './metrics';
import { VoucherManager } from '../../payments/voucher-manager';
import {
  Objective, ObjectiveRequest, SideEffects, WaitingFor,
} from '../../protocols/interfaces';
import { Message, ObjectiveId, ObjectivePayload } from '../../protocols/messages';
import { Objective as VirtualFundObjective, ObjectiveRequest as VirtualFundObjectiveRequest } from '../../protocols/virtualfund/virtualfund';
import { Proposal } from '../../channel/consensus-channel/consensus-channel';
import { Address } from '../../types/types';
import { Voucher } from '../../payments/vouchers';
import { LedgerChannelInfo, PaymentChannelInfo } from '../query/types';
import { ObjectiveRequest as DirectDefundObjectiveRequest } from '../../protocols/directdefund/directdefund';
import { ObjectiveRequest as DirectFundObjectiveRequest, Objective as DirectFundObjective } from '../../protocols/directfund/directfund';
import { ObjectiveRequest as VirtualDefundObjectiveRequest } from '../../protocols/virtualdefund/virtualdefund';

const JSONbigNative = JSONbig({ useNativeBigInt: true });
const log = debug('ts-nitro:client');

export type PaymentRequest = {
  channelId: string
  amount: bigint
};

// EngineEvent is a struct that contains a list of changes caused by handling a message/chain event/api event
export class EngineEvent {
  // These are objectives that are now completed
  completedObjectives: Objective[] = [];

  // These are objectives that have failed
  failedObjectives: Objective[] = [];

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

  // TODO: Implement
  merge(other: EngineEvent): void {}
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
        // TODO: Check switch-case behaviour
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
            res = this.handlePaymentRequest(this.paymentRequestsFromAPI.value());
            break;

          case this.fromChain:
            res = this.handleChainEvent(this.fromChain.value());
            break;

          case this.fromMsg:
            res = this.handleMessage(this.fromMsg.value());
            break;

          case this.fromLedger:
            res = this.handleProposal(this.fromLedger.value());
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

        this._toApi.push(res);
      }
    }
  }

  // handleProposal handles a Proposal returned to the engine from
  // a running ledger channel by pulling its corresponding objective
  // from the store and attempting progress.
  // TODO: Can throw an error
  private handleProposal(proposal: Proposal): EngineEvent {
    return new EngineEvent();
  }

  // handleMessage handles a Message from a peer go-nitro Wallet.
  // It:
  //   - reads an objective from the store,
  //   - generates an updated objective,
  //   - attempts progress on the target Objective,
  //   - attempts progress on related objectives which may have become unblocked.
  // TODO: Can throw an error
  private handleMessage(message: Message): EngineEvent {
    return new EngineEvent();
  }

  // handleChainEvent handles a Chain Event from the blockchain.
  // It:
  //   - reads an objective from the store,
  //   - generates an updated objective, and
  //   - attempts progress.
  // TODO: Can throw an error
  private handleChainEvent(chainEvent: ChainEvent): EngineEvent {
    return new EngineEvent();
  }

  // handleObjectiveRequest handles an ObjectiveRequest (triggered by a client API call).
  // It will attempt to spawn a new, approved objective.
  // TODO: Can throw an error
  private async handleObjectiveRequest(or: ObjectiveRequest): Promise<EngineEvent> {
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

    switch (true) {
      case or instanceof VirtualFundObjectiveRequest:
        // TODO: Implement
        break;
      case or instanceof VirtualDefundObjectiveRequest:
        // TODO: Implement
        break;
      case or instanceof DirectFundObjectiveRequest:
        // TODO: Use try-catch
        try {
          const dfo = DirectFundObjective.newObjective(
            or as DirectFundObjectiveRequest,
            true,
            myAddress,
            chainId,
            this.store.getChannelsByParticipant,
            this.store.getConsensusChannel,
          );

          return this.attemptProgress(dfo);
        } catch (err) {
          throw new Error(`handleAPIEvent: Could not create objective for ${JSONbigNative.stringify(or)}: ${err}`);
        }
        // return this.attemptProgress(dfo);
        break;
      case or instanceof DirectDefundObjectiveRequest:
        // TODO: Implement
        break;
      default:
        throw new Error(`handleAPIEvent: Unknown objective type ${typeof or}`);
    }

    or.signalObjectiveStarted();
    return new EngineEvent();
  }

  // handlePaymentRequest handles an PaymentRequest (triggered by a client API call).
  // It prepares and dispatches a payment message to the counterparty.
  // TODO: Can throw an error
  private handlePaymentRequest(request: PaymentRequest): EngineEvent {
    return new EngineEvent();
  }

  // sendMessages sends out the messages and records the metrics.
  private sendMessages(msgs: Message[]): void {}

  // executeSideEffects executes the SideEffects declared by cranking an Objective or handling a payment request.
  private executeSideEffects(sideEffects: SideEffects): void {}

  // attemptProgress takes a "live" objective in memory and performs the following actions:
  //
  //  1. It pulls the secret key from the store
  //  2. It cranks the objective with that key
  //  3. It commits the cranked objective to the store
  //  4. It executes any side effects that were declared during cranking
  //  5. It updates progress metadata in the store
  private attemptProgress(objective: Objective): EngineEvent {
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
      return new EngineEvent();
    }

    this.store.setObjective(crankedObjective);

    const notifEvents = this.generateNotifications(crankedObjective);

    outgoing.merge(notifEvents);

    this.logger.log(`Objective ${objective.id()} is ${waitingFor}`);

    // If our protocol is waiting for nothing then we know the objective is complete
    // TODO: If attemptProgress is called on a completed objective CompletedObjectives would include that objective id
    // Probably should have a better check that only adds it to CompletedObjectives if it was completed in this crank
    if (waitingFor === 'WaitingForNothing') {
      outgoing.completedObjectives = outgoing.completedObjectives.concat(crankedObjective);
      this.store.releaseChannelFromOwnership(crankedObjective.ownsChannel());

      try {
        this.spawnConsensusChannelIfDirectFundObjective(crankedObjective);
      } catch (err) {
        return new EngineEvent();
      }
    }

    this.executeSideEffects(sideEffects);

    return outgoing;
  }

  // generateNotifications takes an objective and constructs notifications for any related channels for that objective.
  // TODO: Can throw an error
  private generateNotifications(o: Objective): EngineEvent {
    return new EngineEvent();
  }

  // TODO: Can throw an error
  private registerPaymentChannel(vfo: VirtualFundObjective): void {}

  // spawnConsensusChannelIfDirectFundObjective will attempt to create and store a ConsensusChannel derived from
  // the supplied Objective if it is a directfund.Objective.
  //
  // The associated Channel will remain in the store.
  // TODO: Can throw an error
  private spawnConsensusChannelIfDirectFundObjective(crankedObjective: Objective): void {}

  // getOrCreateObjective retrieves the objective from the store.
  // If the objective does not exist, it creates the objective using the supplied payload and stores it in the store
  // TODO: Can throw an error
  private getOrCreateObjective(p: ObjectivePayload): Objective {
    return {} as Objective;
  }

  // constructObjectiveFromMessage Constructs a new objective (of the appropriate concrete type) from the supplied payload.
  // TODO: Can throw an error
  private constructObjectiveFromMessage(id: ObjectiveId, p: ObjectivePayload): Objective {
    return {} as Objective;
  }

  // GetConsensusAppAddress returns the address of a deployed ConsensusApp (for ledger channels)
  getConsensusAppAddress(): Address {
    assert(this.chain);
    return this.chain.getConsensusAppAddress();
  }

  // GetVirtualPaymentAppAddress returns the address of a deployed VirtualPaymentApp
  getVirtualPaymentAppAddress(): Address {
    return ethers.constants.AddressZero;
  }

  // logMessage logs a message to the engine's logger
  private logMessage(msg: Message, direction: MessageDirection): void {}

  // recordMessageMetrics records metrics for a message
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

const Incoming: MessageDirection = 'Incoming';
const Outgoing: MessageDirection = 'Outgoing';

// fromMsgErr wraps errors from objective construction functions and
// returns an error bundled with the objectiveID
// TODO: Can throw an error
function fromMsgErr(id: ObjectiveId, err: Error): void {}

// getProposalObjectiveId returns the objectiveId for a proposal.
function getProposalObjectiveId(p: Proposal): ObjectiveId {
  return '';
}

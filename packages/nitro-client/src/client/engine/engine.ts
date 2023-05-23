import { AddressLike, ethers } from 'ethers';
import { GoChannelPlaceholder, GoReceivingChannelPlaceholder } from '../../go-channel';
import { MessageService } from './messageservice/messageservice';
import { ChainService, ChainEvent } from './chainservice/chainservice';
import { Store } from './store/store';
import { PolicyMaker } from './policy-maker';
import { MetricsRecorder } from './metrics';
import { VoucherManager } from '../../payments/voucher-manager';
import { Objective, ObjectiveRequest, SideEffects } from '../../protocols/interfaces';
import { Message, ObjectiveId, ObjectivePayload } from '../../protocols/messages';
import { Objective as VirtualFundObjective } from '../../protocols/virtualfund/virtualfund';
import { Proposal } from '../../channel/consensus-channel/consensus-channel';

export type PaymentRequest = {
  channelId: string
  amount: bigint
};

// TODO: Implement
export class EngineEvent {}

export class Engine {
  objectiveRequestsFromAPI: GoChannelPlaceholder<ObjectiveRequest>;

  paymentRequestsFromAPI: GoChannelPlaceholder<PaymentRequest>;

  private fromChain: GoReceivingChannelPlaceholder<ChainEvent>;

  private fromMsg: GoReceivingChannelPlaceholder<Message>;

  private fromLedger: GoChannelPlaceholder<Proposal>;

  private _toApi: GoChannelPlaceholder<EngineEvent>;

  private stop: GoChannelPlaceholder<void>;

  private msg: MessageService;

  private chain: ChainService;

  // A Store for persisting and restoring important data
  private store: Store;

  // A PolicyMaker decides whether to approve or reject objectives
  private policymaker: PolicyMaker;

  // logger zerolog.Logger

  private metrics?: MetricsRecorder;

  private vm: VoucherManager;

  constructor(
    vm: VoucherManager,
    msg: MessageService,
    chain: ChainService,
    store: Store,
    policymaker: PolicyMaker,
  ) {
    this.store = store;

    // TODO: Use buffered channel
    this.fromLedger = new GoChannelPlaceholder<Proposal>();

    // bind to inbound chans
    this.objectiveRequestsFromAPI = new GoReceivingChannelPlaceholder<ObjectiveRequest>();
    this.paymentRequestsFromAPI = new GoReceivingChannelPlaceholder<PaymentRequest>();
    this.stop = new GoChannelPlaceholder();

    this.fromChain = chain.eventFeed();
    this.fromMsg = msg.out();

    this.chain = chain;
    this.msg = msg;

    // TODO: Use buffered channel
    this._toApi = new GoChannelPlaceholder<EngineEvent>();

    // logging.ConfigureZeroLogger()
    // e.logger = zerolog.New(logDestination).With().Timestamp().Str("engine", e.store.GetAddress().String()[0:8]).Caller().Logger()

    this.policymaker = policymaker;

    this.vm = vm;

    // e.logger.Print("Constructed Engine")

    // if metricsApi == nil {
    //   metricsApi = &NoOpMetrics{}
    // }
    // e.metrics = NewMetricsRecorder(*e.store.GetAddress(), metricsApi)
  }

  toApi(): GoChannelPlaceholder<EngineEvent> {
    return this._toApi;
  }

  // TODO: Can throw an error
  close(): void {}

  // Run kicks of an infinite loop that waits for communications on the supplied channels, and handles them accordingly
  // The loop exits when a struct is received on the stop channel. Engine.Close() sends that signal.
  run(): void {}

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
  private handleObjectiveRequest(or: ObjectiveRequest): EngineEvent {
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
  // TODO: Can throw an error
  private attemptProgress(objective: Objective): EngineEvent {
    return new EngineEvent();
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
  getConsensusAppAddress(): AddressLike {
    return ethers.ZeroAddress;
  }

  // GetVirtualPaymentAppAddress returns the address of a deployed VirtualPaymentApp
  getVirtualPaymentAppAddress(): AddressLike {
    return ethers.ZeroAddress;
  }

  // logMessage logs a message to the engine's logger
  private logMessage(msg: Message, direction: MessageDirection): void {}

  // recordMessageMetrics records metrics for a message
  private recordMessageMetrics(message: Message): void {}

  // eslint-disable-next-line n/handle-callback-err
  private checkError(err: Error): void {}
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

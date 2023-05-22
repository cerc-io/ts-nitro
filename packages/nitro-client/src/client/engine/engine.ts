import { GoChannelPlaceholder, GoReceivingChannelPlaceholder } from '../../go-channel';
import { MessageService } from './messageservice/messageservice';
import { ChainService, Event as ChainEvent } from './chainservice/chainservice';
import { Store } from './store/store';
import { PolicyMaker } from './policy-maker';
import { MetricsRecorder } from './metrics';
import { VoucherManager } from '../../payments/voucher-manager';
import { ObjectiveRequest } from '../../protocols/interfaces';
import { Message } from '../../protocols/messages';
import { Proposal } from '../../channel/consensus_channel/consensus_channel';

export class Engine {
  objectiveRequestsFromAPI?: GoChannelPlaceholder<ObjectiveRequest>;

  paymentRequestsFromAPI?: GoChannelPlaceholder<PaymentRequest>;

  private fromChain?: GoReceivingChannelPlaceholder<ChainEvent>;

  private fromMsg?: GoReceivingChannelPlaceholder<Message>;

  private fromLedger?: GoChannelPlaceholder<Proposal>;

  private toApi?: GoChannelPlaceholder<EngineEvent>;

  private stop?: GoChannelPlaceholder<void>;

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
    this.vm = vm;

    this.msg = msg;
    this.chain = chain;
    this.store = store;

    this.policymaker = policymaker;
  }
}

export type PaymentRequest = {
  channelId: string
  amount: number
};

// TODO Implement
export class EngineEvent {}

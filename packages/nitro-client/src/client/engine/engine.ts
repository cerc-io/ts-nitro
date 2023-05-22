import { GoChannelPlaceholder, GoReceivingChannelPlaceholder } from '../../go-channel';
import { MessageService } from './messageservice/messageservice';
import { ChainService } from './chainservice/chainservice';
import { Store } from './store/store';
import { PolicyMaker } from './policy-maker';
import MetricsRecorder from './metrics';
import VoucherManager from '../../payments/voucher-manager';

class Engine {
  objectiveRequestsFromAPI?: GoChannelPlaceholder;

  paymentRequestsFromAPI?: GoChannelPlaceholder;

  private fromChain?: GoReceivingChannelPlaceholder;

  private fromMsg?: GoReceivingChannelPlaceholder;

  private fromLedger?: GoChannelPlaceholder;

  private toApi?: GoChannelPlaceholder;

  private stop?: GoChannelPlaceholder;

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

export default Engine;

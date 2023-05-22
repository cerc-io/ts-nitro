import { GoChannelPlaceholder, GoReceivingChannelPlaceholder } from "../../go-channel";
import { MessageService } from "./messageservice/messageservice";
import { ChainService } from "./chainservice/chainservice";
import { Store } from "./store/store";
import { PolicyMaker } from "./policy-maker";
import { MetricsRecorder } from "./metrics";
import { VoucherManager } from "../../payments/voucher-manager";

export class Engine {
  objectiveRequestsFromAPI?: GoChannelPlaceholder;
  paymentRequestsFromAPI?: GoChannelPlaceholder;

  _fromChain?: GoReceivingChannelPlaceholder;
	_fromMsg?: GoReceivingChannelPlaceholder;
	_fromLedger?: GoChannelPlaceholder;

  _toApi?: GoChannelPlaceholder;
	_stop?:  GoChannelPlaceholder;

  _msg: MessageService;
  _chain: ChainService;

  // A Store for persisting and restoring important data
  _store: Store;

  // A PolicyMaker decides whether to approve or reject objectives
  _policymaker: PolicyMaker

	// logger zerolog.Logger

	_metrics?: MetricsRecorder

	_vm: VoucherManager

  constructor (vm: VoucherManager, msg: MessageService, chain: ChainService, store: Store, policymaker: PolicyMaker) {
    this._vm = vm;

    this._msg = msg;
    this._chain = chain;
    this._store = store;

    this._policymaker = policymaker;
  }
}

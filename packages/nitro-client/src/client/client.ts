import { MessageService } from "./engine/messageservice/messageservice";
import { ChainService } from "./engine/chainservice/chainservice";
import { Store } from "./engine/store/store";
import { PolicyMaker } from "./engine/policy-maker";
import { VoucherManager } from "../payments/voucher-manager";
import { Engine } from './engine/engine';

export class Client {
  _engine: Engine;
  _vm: VoucherManager;

  constructor (msg: MessageService, chain: ChainService, store: Store, policymaker: PolicyMaker) {
    this._vm = new VoucherManager();
    this._engine = new Engine(this._vm, msg, chain, store, policymaker);
  }
}

import { MessageService } from './engine/messageservice/messageservice';
import { ChainService } from './engine/chainservice/chainservice';
import { Store } from './engine/store/store';
import { PolicyMaker } from './engine/policy-maker';
import { VoucherManager } from '../payments/voucher-manager';
import { Engine } from './engine/engine';

export class Client {
  private engine: Engine;

  private vm: VoucherManager;

  constructor(msg: MessageService, chain: ChainService, store: Store, policymaker: PolicyMaker) {
    this.vm = new VoucherManager();
    this.engine = new Engine(this.vm, msg, chain, store, policymaker);
  }
}

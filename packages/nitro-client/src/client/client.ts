import { ethers } from 'ethers';

import { MessageService } from './engine/messageservice/messageservice';
import { ChainService } from './engine/chainservice/chainservice';
import { Store } from './engine/store/store';
import { PolicyMaker } from './engine/policy-maker';
import { VoucherManager, VoucherStore } from '../payments/voucher-manager';
import { Engine } from './engine/engine';

export class Client {
  // The core business logic of the client
  private engine: Engine;

  private vm: VoucherManager;

  constructor(msg: MessageService, chain: ChainService, store: Store, policymaker: PolicyMaker) {
    this.vm = new VoucherManager(ethers.ZeroAddress, store as unknown as VoucherStore);
    this.engine = new Engine(this.vm, msg, chain, store, policymaker);
  }
}

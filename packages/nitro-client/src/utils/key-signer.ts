import { ethers } from 'ethers';

import { signData as utilSignData } from '@statechannels/nitro-protocol/dist/src/signatures';
import { NitroSigner } from '@cerc-io/nitro-util';

export class KeySigner implements NitroSigner {
  private pk: string;

  private wallet?: ethers.Wallet;

  constructor(pk: string) {
    this.pk = pk;
  }

  async init() {
    this.wallet = new ethers.Wallet(this.pk);
    return true;
  }

  async getAddress() {
    return this.wallet!.getAddress();
  }

  async signMessage(message: string) {
    return utilSignData(message.toString(), this.wallet!.privateKey);
  }
}

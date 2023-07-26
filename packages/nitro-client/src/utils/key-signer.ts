import { ethers } from 'ethers';

import { signData as utilSignData } from '@statechannels/nitro-protocol/dist/src/signatures';
import { NitroSigner } from '@cerc-io/nitro-util';

export class KeySigner implements NitroSigner {
  private wallet: ethers.Wallet;

  constructor(pk: string) {
    this.wallet = new ethers.Wallet(pk);
  }

  async getAddress() {
    return this.wallet.getAddress();
  }

  async signMessage(message: string) {
    return utilSignData(message.toString(), this.wallet.privateKey);
  }
}

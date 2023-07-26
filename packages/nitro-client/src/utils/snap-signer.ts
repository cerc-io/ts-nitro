import { ethers } from 'ethers';

export class SnapSigner {
  private wallet: ethers.Wallet;

  constructor(pk: string) {
    this.wallet = new ethers.Wallet(pk);
  }

  async getAddress() {
    return this.wallet.getAddress();
  }

  async signMessage(message: string | ethers.utils.Bytes) {
    return this.wallet.signMessage(message);
  }
}

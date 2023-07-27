import { Signature, ethers } from 'ethers';

import { NitroSigner } from '@cerc-io/nitro-util';

export class SnapSigner implements NitroSigner {
  private provider: ethers.providers.ExternalProvider;

  private snapOrigin: string;

  constructor(provider: ethers.providers.Web3Provider, snapOrigin: string) {
    this.provider = provider.provider;
    this.snapOrigin = snapOrigin;
  }

  async init() {
    const result = await (this.provider.request as any)({
      method: 'wallet_invokeSnap',
      params: {
        snapId: this.snapOrigin,
        request: { method: 'initKey' },
      },
    });

    return Boolean(result);
  }

  async getAddress(): Promise<string> {
    const address = await (this.provider.request as any)({
      method: 'wallet_invokeSnap',
      params: {
        snapId: this.snapOrigin,
        request: { method: 'getAddress' },
      },
    });

    return address as string;
  }

  async signMessage(message: string): Promise<Signature> {
    const signature = await (this.provider.request as any)({
      method: 'wallet_invokeSnap',
      params: {
        snapId: this.snapOrigin,
        request: {
          method: 'signMessage',
          params: {
            message,
          },
        },
      },
    });

    return signature as Signature;
  }
}

import { Signature, ethers } from 'ethers';

import { NitroSigner, JSONbigNative } from '@cerc-io/nitro-util';
import { RateInfo, RateType } from '../types';

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

  async updateRates(endpoint: string, rates: RateInfo[]): Promise<void> {
    await (this.provider.request as any)({
      method: 'wallet_invokeSnap',
      params: {
        snapId: this.snapOrigin,
        request: {
          method: 'updateRates',
          params: {
            endpoint,
            rates: JSONbigNative.stringify(rates),
          },
        },
      },
    });
  }

  async requestPermission(endpoint: string, rateType: RateType, name: string): Promise<boolean> {
    const result = await (this.provider.request as any)({
      method: 'wallet_invokeSnap',
      params: {
        snapId: this.snapOrigin,
        request: {
          method: 'requestPermission',
          params: {
            endpoint,
            name,
            rateType,
          },
        },
      },
    });

    return Boolean(result);
  }
}

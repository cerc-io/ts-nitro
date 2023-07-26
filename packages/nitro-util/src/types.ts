import { ethers } from 'ethers';
import JSONbig from 'json-bigint';

export const JSONbigNative = JSONbig({ useNativeBigInt: true });

export type Uint = bigint;
export type Uint64 = bigint;

export interface NitroSigner {
  init(): Promise<boolean>
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<ethers.Signature>;
}

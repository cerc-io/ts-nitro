import { ethers } from 'ethers';
import JSONbig from 'json-bigint';

export const JSONbigNative = JSONbig({ useNativeBigInt: true });

export type Uint = bigint;
export type Uint64 = bigint;

export interface NitroSigner {
  getAddress(): Promise<string>;
  signMessage(message: string | ethers.utils.Bytes): Promise<string>;
}

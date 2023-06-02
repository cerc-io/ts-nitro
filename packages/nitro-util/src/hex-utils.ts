import { ethers } from 'ethers';

export const zeroValueSignature = {
  v: 27, // Choose a valid value for v (27 or 28)
  r: ethers.constants.HashZero, // Set r to a 32-byte zero value
  s: ethers.constants.HashZero, // Set s to a 32-byte zero value
};

// Bytes2Hex returns the hexadecimal encoding of d.
export function bytes2Hex(d: Buffer): string {
  return d.toString('hex');
}

// Hex2Bytes returns the bytes represented by the hexadecimal string str.
export function hex2Bytes(str: string): Buffer {
  return Buffer.from(str, 'hex');
}

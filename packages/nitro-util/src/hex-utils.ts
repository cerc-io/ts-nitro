import { Buffer } from 'buffer';

// Bytes2Hex returns the hexadecimal encoding of d.
export function bytes2Hex(d: Buffer): string {
  return d.toString('hex');
}

// Hex2Bytes returns the bytes represented by the hexadecimal string str.
export function hex2Bytes(str: string): Buffer {
  const hexString = str.startsWith('0x') ? str.substring(2) : str;
  return Buffer.from(hexString, 'hex');
}

export const zeroValueSignature = {
  v: 0, // Choose a valid value for v (27 or 28)
  r: null, // Set r to a 32-byte zero value
  s: null, // Set s to a 32-byte zero value
};

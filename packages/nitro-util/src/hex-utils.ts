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

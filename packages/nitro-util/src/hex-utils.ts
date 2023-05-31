// Bytes2Hex returns the hexadecimal encoding of d.
export function bytes2Hex(d: Buffer): string {
  return d.toString('hex');
}

// Hex2Bytes returns the bytes represented by the hexadecimal string str.
export function hex2Bytes(str: string): Buffer {
  return Buffer.from(str, 'hex');
}

import { Bytes32, isExternalDestination } from '@statechannels/nitro-protocol';
import { ethers } from 'ethers';
import { Address } from './types';

// Destination represents a payable address in go-nitro. In a state channel network,
// payable address are either:
//   - Internal: a 32-byte nitro channel ID, or
//   - External: a blockchain account or contract address, left-padded with 0s
export class Destination {
  // Access using value property
  // Can use prototype.valueOf method if necessary
  value: Bytes32;

  constructor(value: Bytes32 = ethers.utils.hexZeroPad([], 32)) {
    this.value = value;
  }

  // addressToDestinaion left-pads the blockchain address with zeros.
  static addressToDestination(a: Address): Destination {
    const value = '0'.repeat(32 - a.length) + a;

    return new Destination(value);
  }

  // isExternal returns true if the destination is a blockchain address, and false
  // if it is a state channel ID.
  isExternal(): boolean {
    return isExternalDestination(this.value);
  }

  isZero(): boolean {
    for (const b of this.value) {
      if (b !== '0') {
        return false;
      }
    }

    return true;
  }

  string(): string {
    return this.value;
  }

  bytes(): Buffer {
    return Buffer.from(this.value, 'utf-8');
  }
}

import { ethers } from 'ethers';
import { Buffer } from 'buffer';

import { Bytes32, isExternalDestination } from '@statechannels/nitro-protocol';
import { hex2Bytes } from '@cerc-nitro/nitro-util';

import { Address } from './types';

// Destination represents a payable address in go-nitro. In a state channel network,
// payable address are either:
//   - Internal: a 32-byte nitro channel ID, or
//   - External: a blockchain account or contract address, left-padded with 0s
export class Destination {
  // Access using value property
  value: Bytes32 = ethers.utils.hexZeroPad([], 32);

  static fromJSON(data: string): Destination {
    // jsonValue is value for the 'value' field, no need to use fromJSON util method
    const jsonValue = JSON.parse(data);
    return new Destination(jsonValue);
  }

  toJSON(): any {
    // Return value directly
    // (Destination is just an alias in go-nitro)
    return this.value;
  }

  constructor(value: Bytes32 = ethers.utils.hexZeroPad([], 32)) {
    this.value = ethers.utils.hexZeroPad(value, 32);
  }

  // addressToDestinaion left-pads the blockchain address with zeros.
  static addressToDestination(a: Address): Destination {
    const paddedAddress = ethers.utils.hexZeroPad(ethers.utils.hexlify(a), 32);
    const destination = ethers.utils.hexDataSlice(paddedAddress, 12);

    return new Destination(ethers.utils.hexlify(destination));
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
    return hex2Bytes(this.value);
  }
}

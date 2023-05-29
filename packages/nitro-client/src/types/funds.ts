import { Bytes32, isExternalDestination } from '@statechannels/nitro-protocol';
import { Address } from './types';

// A {tokenAddress: amount} map. Address 0 represents a chain's native token (ETH, FIL, etc)
export class Funds {
  // Access using value property
  // Can use prototype.valueOf method if necessary
  value: Map<Address, bigint>;

  constructor(value: Map<Address, bigint> = new Map()) {
    this.value = value;
  }

  // Add returns the sum of the receiver and the input Funds objects
  add(...a: Funds[]): Funds {
    a.push(this);
    return this.sum(...a);
  }

  sum(...a: Funds[]): Funds {
    const sum = new Funds();

    for (const funds of a) {
      for (const asset in funds.value) {
        if (funds.value.has(asset)) {
          const amount = funds.value.get(asset)!;

          if (!sum.value.get(asset)) {
            sum.value.set(asset, BigInt(0));
          }

          sum.value.set(asset, sum.value.get(asset)! + amount);
        }
      }
    }

    return sum;
  }
}

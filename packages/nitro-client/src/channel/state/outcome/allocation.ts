import assert from 'assert';
import _ from 'lodash';
import { Buffer } from 'buffer';

import {
  FieldDescription, JSONbigNative, fromJSON, toJSON,
} from '@cerc-io/nitro-util';

import { Destination } from '../../../types/destination';
import { GuaranteeMetadata } from './guarantee';

export enum AllocationType {
  NormalAllocationType = 0,
  GuaranteeAllocationType,
}

// Allocation declares an Amount to be paid to a Destination.
export class Allocation {
  // Either an ethereum address or an application-specific identifier
  destination: Destination = new Destination();

  // An amount of a particular asset
  amount?: bigint = undefined;

  // Directs calling code on how to interpret the allocation
  allocationType: AllocationType = AllocationType.NormalAllocationType;

  // Custom metadata (optional field, can be zero bytes). This can be used flexibly by different protocols.
  metadata: Buffer = Buffer.alloc(0);

  static jsonEncodingMap: Record<string, FieldDescription> = {
    destination: { type: 'class', value: Destination },
    amount: { type: 'bigint' },
    allocationType: { type: 'number' },
    metadata: { type: 'buffer' },
  };

  static fromJSON(data: string): Allocation {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Allocation(props);
  }

  toJSON(): any {
    return toJSON(Allocation.jsonEncodingMap, this);
  }

  constructor(params: {
    destination?: Destination,
    amount?: bigint,
    allocationType?: AllocationType,
    metadata?: Buffer,
  }) {
    Object.assign(this, params);
  }

  // Equal returns true if the supplied Allocation matches the receiver Allocation, and false otherwise.
  // Fields are compared with ==, except for big.Ints which are compared using Cmp
  equal(b: Allocation): boolean {
    return _.isEqual(this.destination, b.destination)
    && this.allocationType === b.allocationType
    && this.amount === b.amount
    && this.metadata.compare(b.metadata) === 0;
  }

  // Clone returns a deep copy of the receiver.
  clone(): Allocation {
    return new Allocation({
      destination: _.cloneDeep(this.destination),
      amount: this.amount,
      allocationType: this.allocationType,
      metadata: Buffer.from(this.metadata),
    });
  }
}

// Allocations is an array of type Allocation
export class Allocations {
  // Access using value property
  value: Allocation[];

  static fromJSON(data: string): Allocations {
    // jsonValue is a JSON array of Allocation
    // Call fromJSON on individual elements of the array
    const jsonValue = JSONbigNative.parse(data);
    assert(Array.isArray(jsonValue));

    const value = jsonValue.map((allocation): Allocation => {
      return Allocation.fromJSON(JSONbigNative.stringify(allocation));
    });

    return new Allocations(value);
  }

  toJSON(): any {
    // Return the array of Allocation JSON directly
    // (Allocations is not a struct in go-nitro, just an array of Allocation)
    return this.value.map((singleAssetExit) => {
      return singleAssetExit.toJSON();
    });
  }

  constructor(value: Allocation[]) {
    this.value = value;
  }

  // Equal returns true if each of the supplied Allocations matches the receiver Allocation in the same position, and false otherwise.
  equal(b: Allocations): boolean {
    if (this.value.length !== b.value.length) {
      return false;
    }

    for (let i = 0; i < this.value.length; i += 1) {
      if (!this.value[i].equal(b.value[i])) {
        return false;
      }
    }

    return true;
  }

  // Clone returns a deep copy of the receiver
  clone(): Allocations {
    const clone = new Allocations([]);
    for (let i = 0; i < this.value.length; i += 1) {
      clone.value[i] = this.value[i].clone();
    }

    return clone;
  }

  // Total returns the toal amount allocated, summed across all destinations (regardless of AllocationType)
  total(): bigint {
    let total = BigInt(0);
    this.value.forEach((allocation) => {
      total += BigInt(allocation.amount!);
    });

    return total;
  }

  // TotalFor returns the total amount allocated to the given dest (regardless of AllocationType)
  totalFor(dest: Destination): bigint {
    let total = BigInt(0);
    this.value.forEach((allocation) => {
      if (_.isEqual(allocation.destination, dest)) {
        total += BigInt(allocation.amount!);
      }
    });

    return total;
  }

  // Affords returns true if the allocations can afford the given allocation given the input funding, false otherwise.
  //
  // To afford the given allocation, the allocations must include something equal-in-value to it,
  // as well as having sufficient funds left over for it after reserving funds from the input funding for all allocations with higher priority.
  // Note that "equal-in-value" implies the same allocation type and metadata (if any).
  affords(given: Allocation, funding?: bigint): boolean {
    const bigZero = BigInt(0);
    let surplus = funding;

    for (const allocation of this.value) {
      if (allocation.equal(given)) {
        return surplus! >= given.amount!;
      }

      surplus = BigInt(surplus!) - BigInt(allocation.amount!);

      if (!(surplus > BigInt(0))) {
        break; // no funds remain for further allocations
      }
    }

    return false;
  }

  // DivertToGuarantee returns a new Allocations, identical to the receiver but with
  // the leftDestination's amount reduced by leftAmount,
  // the rightDestination's amount reduced by rightAmount,
  // and a Guarantee appended for the guaranteeDestination
  divertToGuarantee(
    leftDestination: Destination,
    rightDestination: Destination,
    leftAmount: bigint | undefined,
    rightAmount: bigint | undefined,
    guaranteeDestination: Destination,
  ): Allocations {
    if (_.isEqual(leftDestination, rightDestination)) {
      throw new Error('debtees must be distinct');
    }

    const newAllocations: Allocation[] = [];
    for (let i = 0; i < this.value.length; i += 1) {
      newAllocations.push(this.value[i].clone());

      /* eslint-disable default-case */
      switch (newAllocations[i].destination) {
        case leftDestination:
          newAllocations[i].amount = BigInt(newAllocations[i].amount!) - BigInt(leftAmount!);
          break;
        case rightDestination:
          newAllocations[i].amount = BigInt(newAllocations[i].amount!) - BigInt(rightAmount!);
          break;
      }

      if (BigInt(0) > BigInt(newAllocations[i].amount!)) {
        throw new Error('insufficient funds');
      }
    }

    let encodedGuaranteeMetadata: Buffer;
    try {
      encodedGuaranteeMetadata = new GuaranteeMetadata({
        left: leftDestination,
        right: rightDestination,
      }).encode();
    } catch (error) {
      throw new Error('error encoding guarantee');
    }

    newAllocations.push(new Allocation({
      destination: guaranteeDestination,
      amount: BigInt(leftAmount!) + BigInt(rightAmount!),
      allocationType: AllocationType.GuaranteeAllocationType,
      metadata: encodedGuaranteeMetadata,
    }));

    return new Allocations(newAllocations);
  }
}

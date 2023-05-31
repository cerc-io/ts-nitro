import { Destination } from '../../../types/destination';

export enum AllocationType {
  NormalAllocationType = 0,
  GuaranteeAllocationType,
}

// Allocation declares an Amount to be paid to a Destination.
export class Allocation {
  // Either an ethereum address or an application-specific identifier
  destination: Destination = new Destination('');

  // An amount of a particular asset
  amount: bigint = BigInt(0);

  // Directs calling code on how to interpret the allocation
  allocationType: AllocationType = AllocationType.NormalAllocationType;

  // Custom metadata (optional field, can be zero bytes). This can be used flexibly by different protocols.
  metadata: Buffer = Buffer.alloc(0);

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
  // TODO: Implement
  equal(b: Allocation): boolean {
    return false;
  }

  // Clone returns a deep copy of the receiver.
  // TODO: Implement
  clone(): Allocation {
    return {} as Allocation;
  }
}

// Allocations is an array of type Allocation
// TODO: Implement
export type Allocations = Allocation[];

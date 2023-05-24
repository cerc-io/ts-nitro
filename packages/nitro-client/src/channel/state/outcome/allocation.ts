export enum AllocationType {
  NormalAllocationType = 0,
  GuaranteeAllocationType,
}

// Allocation declares an Amount to be paid to a Destination.
// TODO: Implement
export class Allocation {
  // Either an ethereum address or an application-specific identifier
  destination?: string;

  // An amount of a particular asset
  amount?: bigint;

  // Directs calling code on how to interpret the allocation
  allocationType?: AllocationType;

  // Custom metadata (optional field, can be zero bytes). This can be used flexibly by different protocols.
  metadata?: Buffer;
}

import { Address } from '../../../types/types';
import { Allocations } from './allocation';

// TODO: uint8 replacement
type AssetType = number;

export type AssetMetadata = {
  assetType: AssetType;
  metadata: Buffer;
};

// SingleAssetExit declares an ordered list of Allocations for a single asset.
export class SingleAssetExit {
  // Either the zero address (implying the native token) or the address of an ERC20 contract
  asset?: Address;

  // Can be used to encode arbitrary additional information that applies to all allocations.
  assetMetadata?: AssetMetadata;

  allocations?: Allocations;

  constructor(
    asset: Address,
    assetMetadata: AssetMetadata,
    allocations: Allocations,
  ) {
    this.asset = asset;
    this.assetMetadata = assetMetadata;
    this.allocations = allocations;
  }

  // Equal returns true if the supplied SingleAssetExit is deeply equal to the receiver.
  // TODO: Implement
  equal(r: SingleAssetExit): boolean {
    return false;
  }

  // Clone returns a deep clone of the receiver.
  // TODO: Implement
  clone(): SingleAssetExit {
    return {} as SingleAssetExit;
  }

  // TotalAllocated returns the toal amount allocated, summed across all destinations (regardless of AllocationType)
  // TODO: Implement
  totalAllocated(): bigint {
    return BigInt(0);
  }

  // TotalAllocatedFor returns the total amount allocated for the specific destination
  // TODO: Implement
  totalAllocatedFor(dest: string): bigint {
    return BigInt(0);
  }
}

// Exit is an ordered list of SingleAssetExits
// TODO: Implement
export type Exit = SingleAssetExit[];

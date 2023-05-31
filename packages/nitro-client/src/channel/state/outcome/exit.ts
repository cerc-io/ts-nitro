import { ethers } from 'ethers';
import { Destination } from '../../../types/destination';
import { Address } from '../../../types/types';
import { Funds } from '../../../types/funds';
import { Allocations } from './allocation';
// eslint-disable-next-line import/no-cycle
import { exitDepositSafetyThreshold, singleAssetExitDepositSafetyThreshold } from './deposit-safety';

// TODO: uint8 replacement
type AssetType = number;

export type AssetMetadata = {
  assetType: AssetType;
  metadata: Buffer;
};

// SingleAssetExit declares an ordered list of Allocations for a single asset.
export class SingleAssetExit {
  // Either the zero address (implying the native token) or the address of an ERC20 contract
  asset: Address = ethers.constants.AddressZero;

  // Can be used to encode arbitrary additional information that applies to all allocations.
  assetMetadata?: AssetMetadata;

  allocations: Allocations = [];

  constructor(
    params: {
      asset?: Address,
      assetMetadata?: AssetMetadata,
      allocations?: Allocations,
    },
  ) {
    Object.assign(this, params);
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
  totalAllocatedFor(dest: Destination): bigint {
    return BigInt(0);
  }

  depositSafetyThreshold(interest: Destination): bigint {
    return singleAssetExitDepositSafetyThreshold(this, interest);
  }
}

// Exit is an ordered list of SingleAssetExits
export class Exit {
  // Access using value property
  // Can use prototype.valueOf method if necessary
  value: SingleAssetExit[];

  constructor(value: SingleAssetExit[]) {
    this.value = value;
  }

  // totalAllocated returns the sum of all Funds that are allocated by the outcome.
  //
  // NOTE that these Funds are potentially different from a channel's capacity to
  // pay out a given set of allocations, which is limited by the channel's holdings
  totalAllocated(): Funds {
    const fullValue = new Funds();

    for (const assetExit of this.value) {
      fullValue.value.set(assetExit.asset, assetExit.totalAllocated());
    }

    return fullValue;
  }

  // totalAllocatedFor returns the total amount allocated to the given dest (regardless of AllocationType)
  totalAllocatedFor(dest: Destination): Funds {
    const total = new Funds();

    for (const assetAllocation of this.value) {
      total.value.set(assetAllocation.asset, assetAllocation.totalAllocatedFor(dest));
    }

    return total;
  }

  depositSafetyThreshold(interest: Destination): Funds {
    return exitDepositSafetyThreshold(this, interest);
  }
}

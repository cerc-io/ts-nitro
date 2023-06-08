import assert from 'assert';
import { ethers } from 'ethers';

import { FieldDescription, fromJSON, toJSON } from '@cerc-io/nitro-util';

import { Destination } from '../../../types/destination';
import { Address } from '../../../types/types';
import { Funds } from '../../../types/funds';
import { Allocation, Allocations } from './allocation';
// eslint-disable-next-line import/no-cycle
import { exitDepositSafetyThreshold, singleAssetExitDepositSafetyThreshold } from './deposit-safety';

// TODO: uint8 replacement
type AssetType = number;

export type AssetMetadata = {
  assetType: AssetType;
  metadata: Buffer;
};

const assetMetadataJsonEncodingMap: Record<string, FieldDescription> = {
  assetType: { type: 'number' },
  metadata: { type: 'buffer' },
};

// SingleAssetExit declares an ordered list of Allocations for a single asset.
export class SingleAssetExit {
  // Either the zero address (implying the native token) or the address of an ERC20 contract
  asset: Address = ethers.constants.AddressZero;

  // Can be used to encode arbitrary additional information that applies to all allocations.
  assetMetadata: AssetMetadata = { assetType: 0, metadata: Buffer.alloc(0) };

  allocations: Allocations = new Allocations([]);

  static jsonEncodingMap: Record<string, FieldDescription> = {
    asset: { type: 'string' },
    assetMetadata: { type: 'object', value: assetMetadataJsonEncodingMap },
    allocations: { type: 'class', value: Allocations },
  };

  static fromJSON(data: string): SingleAssetExit {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new SingleAssetExit(props);
  }

  toJSON(): any {
    return toJSON(SingleAssetExit.jsonEncodingMap, this);
  }

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
  equal(r: SingleAssetExit): boolean {
    return this.assetMetadata?.metadata === r.assetMetadata?.metadata
    && this.assetMetadata?.assetType === r.assetMetadata?.assetType
    && this.asset === r.asset
    && this.allocations.equal(r.allocations);
  }

  // Clone returns a deep clone of the receiver.
  clone(): SingleAssetExit {
    return new SingleAssetExit({
      asset: this.asset,
      assetMetadata: this.assetMetadata,
      allocations: this.allocations.clone(),
    });
  }

  // TotalAllocated returns the toal amount allocated, summed across all destinations (regardless of AllocationType)
  totalAllocated(): bigint {
    return this.allocations.total();
  }

  // TotalAllocatedFor returns the total amount allocated for the specific destination
  totalAllocatedFor(dest: Destination): bigint {
    return this.allocations.totalFor(dest);
  }

  depositSafetyThreshold(interest: Destination): bigint {
    return singleAssetExitDepositSafetyThreshold(this, interest);
  }
}

// Exit is an ordered list of SingleAssetExits
export class Exit {
  // Access using value property
  value: SingleAssetExit[];

  static fromJSON(data: string): Exit {
    // jsonValue is a JSON array of SingleAssetExit
    // Call fromJSON on individual elements of the array
    const jsonValue = JSON.parse(data);
    assert(Array.isArray(jsonValue));

    const value = jsonValue.map((singleAssetExitValue): SingleAssetExit => {
      return SingleAssetExit.fromJSON(JSON.stringify(singleAssetExitValue));
    });

    return new Exit(value);
  }

  toJSON(): any {
    // Return the array of SingleAssetExit JSON directly
    // (Exit is not a struct in go-nitro, just an array of SingleAssetExit)
    return this.value.map((singleAssetExit) => {
      return toJSON(SingleAssetExit.jsonEncodingMap, singleAssetExit);
    });
  }

  constructor(value: SingleAssetExit[]) {
    this.value = value;
  }

  // Clone returns a deep clone of the receiver.
  clone(): Exit {
    const clone = new Exit([]);

    for (const [i, sae] of this.value.entries()) {
      clone.value[i] = sae.clone();
    }

    return clone;
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

  // Affords returns true if every allocation in the allocationMap can be afforded by the Exit, given the funds
  //
  // Both arguments are maps keyed by the same assets
  // TODO: Implement
  affords(allocationMap: Map<Address, Allocation>, fundingMap: Funds): boolean {
    return false;
  }
}

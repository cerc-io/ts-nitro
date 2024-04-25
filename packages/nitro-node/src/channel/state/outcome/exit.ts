import { ethers } from 'ethers';
import { Buffer } from 'buffer';
import _ from 'lodash';

import {
  FieldDescription, JSONbigNative, fromJSON, toJSON,
} from '@cerc-nitro/nitro-util';

import { Destination } from '../../../types/destination';
import { Address } from '../../../types/types';
import { Funds } from '../../../types/funds';
import { Allocation, Allocations } from './allocation';
// eslint-disable-next-line import/no-cycle
import { exitDepositSafetyThreshold, singleAssetExitDepositSafetyThreshold } from './deposit-safety';

type AssetType = number;

export type AssetMetadata = {
  assetType: AssetType;
  metadata: Buffer | null;
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
  assetMetadata: AssetMetadata = { assetType: 0, metadata: null };

  allocations: Allocations = new Allocations();

  static jsonEncodingMap: Record<string, FieldDescription> = {
    asset: { type: 'address' },
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
    return _.isEqual(this.assetMetadata.metadata, r.assetMetadata.metadata)
    && this.assetMetadata.assetType === r.assetMetadata.assetType
    && this.asset === r.asset
    && this.allocations.equal(r.allocations);
  }

  // Clone returns a deep clone of the receiver.
  clone(): SingleAssetExit {
    return new SingleAssetExit({
      asset: this.asset,
      assetMetadata: _.cloneDeep(this.assetMetadata),
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

// easyExit is a more ergonomic data type which can be derived from an Exit
type EasyExit = Map<Address, SingleAssetExit>;

// Exit is an ordered list of SingleAssetExits
export class Exit {
  // Access using value property
  value: SingleAssetExit[] | null;

  static fromJSON(data: string): Exit {
    // jsonValue is a JSON array of SingleAssetExit
    // Call fromJSON on individual elements of the array
    const jsonValue = JSONbigNative.parse(data);

    let value = null;
    if (Array.isArray(jsonValue)) {
      value = jsonValue.map((singleAssetExitValue): SingleAssetExit => {
        return SingleAssetExit.fromJSON(JSONbigNative.stringify(singleAssetExitValue));
      });
    }

    return new Exit(value);
  }

  toJSON(): any {
    // Return the array of SingleAssetExit JSON directly
    // (Exit is not a struct in go-nitro, just an array of SingleAssetExit)
    return this.value === null ? null : this.value.map((singleAssetExit) => singleAssetExit.toJSON());
  }

  constructor(value: SingleAssetExit[] | null = null) {
    this.value = value;
  }

  // Equal returns true if the supplied Exit is deeply equal to the receiver.
  equal(b: Exit): boolean {
    if (this.value === null || b.value === null) {
      return this.value === b.value;
    }

    if (this.value.length !== b.value.length) {
      return false;
    }

    for (const [i, sae] of this.value.entries()) {
      if (!sae.equal(b.value[i])) {
        return false;
      }
    }

    return true;
  }

  // Clone returns a deep clone of the receiver.
  clone(): Exit {
    const clone = new Exit([]);
    for (const [i, sae] of (this.value ?? []).entries()) {
      clone.value![i] = sae.clone();
    }

    return clone;
  }

  // totalAllocated returns the sum of all Funds that are allocated by the outcome.
  //
  // NOTE that these Funds are potentially different from a channel's capacity to
  // pay out a given set of allocations, which is limited by the channel's holdings
  totalAllocated(): Funds {
    const fullValue = new Funds();

    for (const assetExit of (this.value ?? [])) {
      fullValue.value.set(assetExit.asset, assetExit.totalAllocated());
    }

    return fullValue;
  }

  // totalAllocatedFor returns the total amount allocated to the given dest (regardless of AllocationType)
  totalAllocatedFor(dest: Destination): Funds {
    const total = new Funds();

    for (const assetAllocation of (this.value ?? [])) {
      total.value.set(assetAllocation.asset, assetAllocation.totalAllocatedFor(dest));
    }

    return total;
  }

  depositSafetyThreshold(interest: Destination): Funds {
    return exitDepositSafetyThreshold(this, interest);
  }

  // toEasyExit() convets an Exit into an easyExit.
  //
  // An EasyExit is a mapping from asset to SingleAssetExit, rather than an array.
  // The conversion loses some information, because the position in the original array is not recorded in the map.
  // The position has no semantic meaning, but does of course affect the hash of the exit.
  // Furthermore, this transformation assumes there are *no* repeated entries.
  // For these reasons, the transformation should be considered non-invertibile and used with care.
  toEasyExit(): EasyExit {
    const easy: EasyExit = new Map<Address, SingleAssetExit>();
    for (const [i] of (this.value ?? []).entries()) {
      easy.set(this.value![i].asset, this.value![i]);
    }
    return easy;
  }

  // Affords returns true if every allocation in the allocationMap can be afforded by the Exit, given the funds
  //
  // Both arguments are maps keyed by the same assets
  affords(allocationMap: Map<Address, Allocation>, fundingMap: Funds): boolean {
    const easyExit = this.toEasyExit();
    for (const [asset] of easyExit) {
      const x = fundingMap.value.get(asset);
      if (!x) {
        return false;
      }
      const allocation = allocationMap.get(asset);
      if (!easyExit.get(asset)?.allocations.affords(allocation!, x)) {
        return false;
      }
    }
    return true;
  }
}

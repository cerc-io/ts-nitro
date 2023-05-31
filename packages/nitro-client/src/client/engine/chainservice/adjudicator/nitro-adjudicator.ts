// Code generated - DO NOT EDIT.
// This file is a generated binding and any manual changes will be lost.
// TODO: Generate code from Ethereum contract using https://github.com/dethcrypto/TypeChain

import { ethers } from 'ethers';
import { ContractArtifacts } from '@statechannels/nitro-protocol';

// INitroTypesFixedPart is an auto generated low-level Go binding around an user-defined struct.
export interface INitroTypesFixedPart {
  participants?: string[]
  channelNonce?: string
  appDefinition?: string
  challengeDuration?: bigint
}

// INitroTypesSignature is an auto generated low-level Go binding around an user-defined struct.
export interface INitroTypesSignature {}

// INitroTypesSignedVariablePart is an auto generated low-level Go binding around an user-defined struct.
export interface INitroTypesSignedVariablePart {
  variablePart: INitroTypesVariablePart;
  sigs: INitroTypesSignature[];
}

export interface INitroTypesVariablePart {
  appData: Buffer;
  turnNum: bigint;
  isFinal: boolean;
  outcome: ExitFormatSingleAssetExit[];
}

export interface ExitFormatSingleAssetExit {
  asset: string;
  assetMetadata: ExitFormatAssetMetadata;
  allocations: ExitFormatAllocation[];
}

export interface ExitFormatAssetMetadata {
  assetType: number;
  metadata: Buffer;
}

export interface ExitFormatAllocation {
  destination: string;
  amount: bigint;
  allocationType: number;
  metadata: Buffer;
}

// NitroAdjudicator is an auto generated Go binding around an Ethereum contract.
// TODO: Implement
export class NitroAdjudicator {
  private contract = new ethers.Contract(ethers.constants.AddressZero, ContractArtifacts.NitroAdjudicatorArtifact.abi);

  holdings(opts: {}, arg0: string, arg1: string): bigint {
    return BigInt(0);
  }

  async deposit(
    opts: ethers.Transaction,
    asset: string,
    channelId: string,
    expectedHeld: bigint,
    amount: bigint,
  ): Promise<ethers.ContractTransaction> {
    return this.contract.deposit(asset, channelId, expectedHeld, amount);
  }

  concludeAndTransferAllAssets(
    opts: ethers.Transaction,
    fixedPart: INitroTypesFixedPart,
    candidate: INitroTypesSignedVariablePart,
  ): Promise<ethers.ContractTransaction> {
    return this.contract.concludeAndTransferAllAssets(fixedPart, candidate);
  }
}

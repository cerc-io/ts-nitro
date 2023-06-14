import { Transaction } from 'ethers';

import { AllocationUpdatedEventObject, NitroAdjudicator } from './adjudicator/nitro-adjudicator';
import { Address } from '../../../types/types';
import { Destination } from '../../../types/destination';

// getAssetHoldings reads on-chain holdings for a channel,asset address, and block number
// TODO: Can throw an error
// TODO: Implement
function getAssetHoldings(na: NitroAdjudicator, assetAddress: Address, blockNumber: bigint, channelId: Destination): bigint {
  return BigInt(0);
}

// getChainHolding reads on-chain holdings for a channel and an asset address given a transaction and an event generated by the transaction.
// TODO: Implement
export function getChainHolding(na: NitroAdjudicator, tx: Transaction, event: AllocationUpdatedEventObject): [Address, bigint] {
  return ['', BigInt(0)];
}

// assetAddressForIndex uses the input parameters of a transaction to map an asset index to an asset address
// TODO: Check tx type
// TODO: Can throw an error
// TODO: Implement
function assetAddressForIndex(na: NitroAdjudicator, tx: Transaction, index: bigint): Address {
  return '';
}

// TODO: Can throw an error
// TODO: Implement
function decodeTxParams(abi: any, data: Buffer): Map<string, any> {
  return new Map();
}

/* eslint-disable @typescript-eslint/no-use-before-define */

import { Transaction, utils, providers } from 'ethers';

import { AllocationUpdatedEventObject, INitroTypes, NitroAdjudicator } from './adjudicator/nitro-adjudicator';
import { Address } from '../../../types/types';
import { Destination } from '../../../types/destination';

// getAssetHoldings reads on-chain holdings for a channel,asset address, and block number
async function getAssetHoldings(na: NitroAdjudicator, assetAddress: Address, blockNumber: bigint, channelId: Destination): Promise<bigint> {
  const amount = await na.holdings(assetAddress, channelId.value, { blockTag: Number(blockNumber) });
  return amount.toBigInt();
}

// getChainHolding reads on-chain holdings for a channel and an asset address given a transaction and an event generated by the transaction.
export async function getChainHolding(
  na: NitroAdjudicator,
  tx: providers.TransactionResponse,
  event: AllocationUpdatedEventObject,
): Promise<[string, bigint]> {
  // Use providers.TransactionResponse as the type for tx to access blockNumber
  // (block number not part of the event unlike in go-nitro)
  const blockNumber = tx.blockNumber!;

  const assetAddress = assetAddressForIndex(na, tx, event.assetIndex.toBigInt());
  const amount = await getAssetHoldings(na, assetAddress, BigInt(blockNumber), new Destination(event.channelId));

  return [assetAddress, amount];
}

// assetAddressForIndex uses the input parameters of a transaction to map an asset index to an asset address
function assetAddressForIndex(na: NitroAdjudicator, tx: Transaction, index: bigint): Address {
  const abiInterface = na.interface;
  const params = decodeTxParams(abiInterface, tx);

  const candidate = params.candidate as INitroTypes.SignedVariablePartStructOutput;

  return candidate.variablePart.outcome[Number(index)].asset;
}

function decodeTxParams(abiInterface: utils.Interface, tx: Transaction): utils.Result {
  const txData = abiInterface.parseTransaction(tx);

  return txData.args;
}
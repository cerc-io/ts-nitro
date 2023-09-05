/* eslint-disable @typescript-eslint/no-use-before-define */

import {
  Transaction, utils, providers, BigNumber,
} from 'ethers';

import { AllocationUpdatedEventObject, INitroTypes, NitroAdjudicator } from './adjudicator/nitro-adjudicator';
import { Address } from '../../../types/types';
import { Destination } from '../../../types/destination';

// assetAddressForIndex uses the input parameters of a transaction to map an asset index to an asset address
export function assetAddressForIndex(na: NitroAdjudicator, tx: Transaction, index?: BigNumber): Address {
  const abiInterface = na.interface;
  const params = decodeTxParams(abiInterface, tx);

  const candidate = params.candidate as INitroTypes.SignedVariablePartStructOutput;

  return candidate.variablePart.outcome[Number(index)].asset;
}

function decodeTxParams(abiInterface: utils.Interface, tx: Transaction): utils.Result {
  const txData = abiInterface.parseTransaction(tx);

  return txData.args;
}

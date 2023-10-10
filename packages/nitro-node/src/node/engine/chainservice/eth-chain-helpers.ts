/* eslint-disable @typescript-eslint/no-use-before-define */

import {
  Transaction, utils,
} from 'ethers';

import { INitroTypes, NitroAdjudicator } from './adjudicator/nitro-adjudicator';
import { Address } from '../../../types/types';

// assetAddressForIndex uses the input parameters of a transaction to map an asset index to an asset address
export function assetAddressForIndex(na: NitroAdjudicator, tx: Transaction, index?: bigint): Address {
  const abiInterface = na.interface;
  const params = decodeTxParams(abiInterface, tx);

  const candidate = params.candidate as INitroTypes.SignedVariablePartStructOutput;

  return candidate.variablePart.outcome[Number(index)].asset;
}

function decodeTxParams(abiInterface: utils.Interface, tx: Transaction): utils.Result {
  const txData = abiInterface.parseTransaction(tx);

  return txData.args;
}

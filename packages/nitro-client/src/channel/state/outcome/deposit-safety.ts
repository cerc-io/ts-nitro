import { Destination } from '../../../types/destination';
import { Funds } from '../../../types/funds';
// eslint-disable-next-line import/no-cycle
import { Exit, SingleAssetExit } from './exit';

// DepositSafetyThreshold returns the amount of this asset that a user with
// the specified interest must see on-chain before the safe recoverability of
// their own deposits is guaranteed
export const singleAssetExitDepositSafetyThreshold = (singleAssetExit: SingleAssetExit, interest: Destination): bigint => {
  let sum: bigint = BigInt(0);

  for (const allocation of singleAssetExit.allocations.value) {
    if (allocation.destination === interest) {
      // We have 'hit' the destination whose balances we are interested in protecting
      return sum;
    }

    sum += allocation.amount;
  }

  return sum;
};

// exitDepositSafetyThreshold returns the Funds that a user with the specified
// interest must see on-chain before the safe recoverability of their
// deposits is guaranteed
export const exitDepositSafetyThreshold = (exit: Exit, interest: Destination): Funds => {
  const threshold: Funds = new Funds();

  for (const assetExit of exit.value) {
    threshold.value.set(assetExit.asset, assetExit.depositSafetyThreshold(interest));
  }

  return threshold;
};

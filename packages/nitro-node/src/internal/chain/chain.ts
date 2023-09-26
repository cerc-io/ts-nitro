import debug from 'debug';
import assert from 'assert';
import { providers } from 'ethers';

import { Address } from '../../types/types';

export interface ChainOpts {
  naAddress: Address
  vpaAddress: Address
  caAddress: Address
  provider?: providers.JsonRpcProvider,
  chainUrl?: string
  chainPk?: string
}

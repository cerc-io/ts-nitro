import debug from 'debug';
import assert from 'assert';
import { providers } from 'ethers';

import { Address } from '../../types/types';
import { EthChainService } from '../../node/engine/chainservice/eth-chainservice';

export interface ChainOpts {
  naAddress: Address
  vpaAddress: Address
  caAddress: Address
  provider?: providers.JsonRpcProvider,
  chainUrl?: string
  chainPk?: string
}

const log = debug('ts-nitro:chain');

export async function initializeEthChainService(chainOpts: ChainOpts): Promise<EthChainService> {
  if (chainOpts.provider) {
    log(`Initializing chain service and connecting to ${chainOpts.provider.connection.url}...`);

    return EthChainService.newEthChainServiceWithProvider(
      chainOpts.provider,
      chainOpts.naAddress,
      chainOpts.caAddress,
      chainOpts.vpaAddress,
    );
  }

  assert(chainOpts.chainUrl && chainOpts.chainPk);
  log(`Initializing chain service and connecting to ${chainOpts.chainUrl}...`);
  return EthChainService.newEthChainService(
    chainOpts.chainUrl,
    chainOpts.chainPk,
    chainOpts.naAddress,
    chainOpts.caAddress,
    chainOpts.vpaAddress,
  );
}

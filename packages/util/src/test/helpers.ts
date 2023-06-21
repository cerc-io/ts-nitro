import {
  P2PMessageService,
  Client,
  MemStore,
  EthChainService,
  PermissivePolicy,
} from '@cerc-io/nitro-client';

import { CHAIN_URL } from './constants';
import {
  nitroAdjudicatorAddress,
  virtualPaymentAppAddress,
  consensusAppAddress,
} from './addresses.json';

/**
 * setupClient sets up a client using the given args
 *
 * @param msgPort
 * @param pk
 * @param chainPk
 */
export async function setupClient(
  messageService: P2PMessageService,
  store: MemStore,
  options: {
    chainPk: string,
  },
): Promise<Client> {
  const {
    chainPk,
  } = options;

  const chainService = await EthChainService.newEthChainService(
    CHAIN_URL,
    chainPk,
    nitroAdjudicatorAddress,
    consensusAppAddress,
    virtualPaymentAppAddress,
  );

  const client = await Client.new(
    messageService,
    chainService,
    store,
    undefined,
    new PermissivePolicy(),
  );

  return client;
}

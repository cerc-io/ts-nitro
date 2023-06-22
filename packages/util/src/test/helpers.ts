import {
  P2PMessageService,
  Client,
  MemStore,
  EthChainService,
  PermissivePolicy,
} from '@cerc-io/nitro-client';

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
    chainURL: string
  },
): Promise<Client> {
  const {
    chainPk,
    chainURL,
  } = options;

  const chainService = await EthChainService.newEthChainService(
    chainURL,
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

import {
  P2PMessageService,
  Client,
  MemStore,
  EthChainService,
  PermissivePolicy,
} from '@cerc-io/nitro-client';

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
    chainURL: string,
    naAddress: string,
    caAddress: string,
    vpaAddress: string
  },
): Promise<Client> {
  const {
    chainPk,
    chainURL,
    naAddress,
    caAddress,
    vpaAddress,
  } = options;

  const chainService = await EthChainService.newEthChainService(
    chainURL,
    chainPk,
    naAddress,
    caAddress,
    vpaAddress,
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

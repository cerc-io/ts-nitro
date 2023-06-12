import {
  Client,
  EthChainService,
  MemStore,
  PermissivePolicy,
} from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';

import { createP2PMessageService } from '../src/utils';
import {
  CHAIN_URL,
  NA_ADDRESS,
  CA_ADDRESS,
  VPA_ADDRESS,
} from './constants';

/**
 * setupClient sets up a client using the given args
 *
 * @param msgPort
 * @param pk
 * @param chainPk
 */
export async function setupClient(
  msgPort: number,
  pk: string,
  chainPk: string,
): Promise<Client> {
  const store = new MemStore(hex2Bytes(pk));

  const chainService = await EthChainService.newEthChainService(
    CHAIN_URL,
    chainPk,
    NA_ADDRESS,
    CA_ADDRESS,
    VPA_ADDRESS,
  );

  const messageService = await createP2PMessageService(msgPort, store.getAddress());

  return Client.new(
    messageService,
    chainService,
    store,
    undefined,
    new PermissivePolicy(),
  );
}

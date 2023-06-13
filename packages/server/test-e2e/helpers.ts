import {
  Client,
  EthChainService,
  MemStore,
  P2PMessageService,
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
): Promise<[Client, P2PMessageService]> {
  const store = new MemStore(hex2Bytes(pk));

  const chainService = await EthChainService.newEthChainService(
    CHAIN_URL,
    chainPk,
    NA_ADDRESS,
    CA_ADDRESS,
    VPA_ADDRESS,
  );

  const messageService = await createP2PMessageService(msgPort, store.getAddress());

  const client = await Client.new(
    messageService,
    chainService,
    store,
    undefined,
    new PermissivePolicy(),
  );

  return [client, messageService];
}

// waitForPeerInfoExchange waits for all the P2PMessageServices to receive peer info from each other
/* eslint-disable no-await-in-loop */
export async function waitForPeerInfoExchange(numOfPeers: number, services: P2PMessageService[]) {
  for (let i = 0; i < numOfPeers; i += 1) {
    await Promise.all(services.map((service) => service.peerInfoReceived().shift()));
  }
}

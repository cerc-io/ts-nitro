import { Buffer } from 'buffer';

import {
  P2PMessageService,
} from '@cerc-io/nitro-client';

export const createP2PMessageService = async (
  relayMultiAddr: string,
  port: number,
  me: string,
  privateKey: Buffer,
): Promise<P2PMessageService> => P2PMessageService.newMessageService(
  relayMultiAddr,
  '127.0.0.1',
  port,
  me,
  privateKey,
  true,
);

// waitForPeerInfoExchange waits for all the P2PMessageServices to receive peer info from each other
export async function waitForPeerInfoExchange(numOfPeers: number, services: P2PMessageService[]) {
  for (let i = 0; i < numOfPeers; i += 1) {
    /* eslint-disable no-await-in-loop */
    await Promise.all(services.map((service) => service.peerInfoReceived().shift()));
  }
}

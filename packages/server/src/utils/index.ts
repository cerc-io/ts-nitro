import {
  P2PMessageService,
} from '@cerc-io/nitro-node';

// waitForPeerInfoExchange waits for all the P2PMessageServices to receive peer info from each other
export async function waitForPeerInfoExchange(services: P2PMessageService[]) {
  for (let i = 0; i < services.length - 1; i += 1) {
    /* eslint-disable no-await-in-loop */
    await Promise.all(services.map((service) => service.peerInfoReceived().shift()));
  }
}

// waitForMultiplePeers waits for peer info to be received from given number of peers
export async function waitForMultiplePeers(numOfPeers: number, services: P2PMessageService[]) {
  for (let i = 0; i < numOfPeers; i += 1) {
    /* eslint-disable no-await-in-loop */
    await Promise.all(services.map((service) => service.peerInfoReceived().shift()));
  }
}

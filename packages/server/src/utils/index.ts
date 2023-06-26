import {
  P2PMessageService,
} from '@cerc-io/nitro-client';

export const createP2PMessageService = async (port: number, me: string): Promise<P2PMessageService> => {
  const keys = await import('@libp2p/crypto/keys');

  // TODO: Generate private key from a string
  const privateKey = await keys.generateKeyPair('Ed25519');

  return P2PMessageService.newMessageService(
    '127.0.0.1',
    port,
    me,
    privateKey.bytes,
    true,
  );
};

// waitForPeerInfoExchange waits for all the P2PMessageServices to receive peer info from each other
/* eslint-disable no-await-in-loop */
export async function waitForPeerInfoExchange(numOfPeers: number, services: P2PMessageService[]) {
  for (let i = 0; i < numOfPeers; i += 1) {
    await Promise.all(services.map((service) => service.peerInfoReceived().shift()));
  }
}

/**
 * Left pads a 20 byte address hex string with zeros until it is a 32 byte hex string
 * e.g.,
 * 0x9546E319878D2ca7a21b481F873681DF344E0Df8 becomes
 * 0x0000000000000000000000009546E319878D2ca7a21b481F873681DF344E0Df8
 *
 * @param address - 20 byte hex string
 * @returns 32 byte padded hex string
 */
export function convertAddressToBytes32(address: string): string {
  const digits = address.startsWith('0x') ? address.substring(2) : address;
  return `0x${digits.padStart(24, '0')}`;
}

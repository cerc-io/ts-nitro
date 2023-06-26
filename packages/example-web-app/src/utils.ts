import { P2PMessageService } from '@cerc-io/nitro-client';

export const createP2PMessageService = async (relayMultiAddr: string, me: string): Promise<P2PMessageService> => {
  const keys = await import('@libp2p/crypto/keys');

  // TODO: Generate private key from a string
  const privateKey = await keys.generateKeyPair('Ed25519');

  return P2PMessageService.newMessageService(
    relayMultiAddr,
    me,
    privateKey.bytes,
    true,
  );
};

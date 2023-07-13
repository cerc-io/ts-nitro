import { Buffer } from 'buffer';

// @ts-expect-error
import type { Peer as PeerInterface, PeerInitConfig, PeerIdObj } from '@cerc-io/peer';

export const createPeerIdFromKey = async (pk: Buffer): Promise<PeerIdObj> => {
  const {
    marshalPrivateKey, marshalPublicKey, generateKeyPairFromSeed,
  } = await import('@libp2p/crypto/keys');

  // TODO: Unmarshall private key similar to go-nitro
  // const messageKey = await unmarshalPrivateKey(pk);
  // Workaround to get a libp2p private key from `pk` passed to message service
  const messageKey = await generateKeyPairFromSeed('Ed25519', pk);

  const PeerIdFactory = await import('@libp2p/peer-id-factory');
  const peerId = await PeerIdFactory.createFromPrivKey(messageKey);

  return {
    id: peerId.toString(),
    privKey: Buffer.from(marshalPrivateKey(messageKey)).toString('base64'),
    pubKey: Buffer.from(marshalPublicKey(messageKey.public)).toString('base64'),
  };
};

export const createPeerAndInit = async (
  relayMultiAddr: string,
  initOptions: PeerInitConfig = {},
  peerIdObj?: PeerIdObj,
): Promise<PeerInterface> => {
  const { Peer } = await import ('@cerc-io/peer');
  // TODO: Debug connection issue with webrtc enabled in ts-nitro
  // Disabled by setting nodejs option to true below
  const peer = new Peer(relayMultiAddr, true);

  await peer.init(
    initOptions,
    peerIdObj,
  );

  return peer;
};

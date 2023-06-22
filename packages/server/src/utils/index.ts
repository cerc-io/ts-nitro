import {
  Client,
  EthChainService,
  MemStore,
  P2PMessageService,
  PermissivePolicy,
  Allocation,
  Destination,
  Exit,
  SingleAssetExit,
  AllocationType,
  Allocations,
} from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';

import {
  nitroAdjudicatorAddress,
  virtualPaymentAppAddress,
  consensusAppAddress,
} from '../../addresses.json';

export const createP2PMessageService = async (port: number, me: string): Promise<P2PMessageService> => {
  const keys = await import('@libp2p/crypto/keys');

  // TODO: Generate private key from a string
  const privateKey = await keys.generateKeyPair('Ed25519');

  return P2PMessageService.newMessageService(
    '127.0.0.1',
    port,
    me.toLowerCase(),
    privateKey.bytes,
    true,
  );
};

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
  chainURL: string,
): Promise<[Client, P2PMessageService]> {
  const store = new MemStore(hex2Bytes(pk));

  const chainService = await EthChainService.newEthChainService(
    chainURL,
    chainPk,
    nitroAdjudicatorAddress,
    consensusAppAddress,
    virtualPaymentAppAddress,
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

/**
 * createOutcome creates a basic outcome for a channel
 *
 * @param asset - The asset to fund the channel with
 * @param alpha - The address of the first participant
 * @param beta - The address of the second participant
 * @param amount - The amount to allocate to each participant
 * @returns An outcome for a directly funded channel with 100 wei allocated to each participant
 */
export function createOutcome(
  asset: string,
  alpha: string,
  beta: string,
  amount: number,
): Exit {
  return new Exit([
    new SingleAssetExit({
      asset,
      assetMetadata: {
        assetType: 0,
        metadata: Buffer.alloc(0),
      },
      allocations: new Allocations([
        new Allocation({
          destination: Destination.addressToDestination(convertAddressToBytes32(alpha)),
          amount: BigInt(amount),
          allocationType: AllocationType.NormalAllocationType,
          metadata: Buffer.alloc(0),
        }),
        new Allocation({
          destination: Destination.addressToDestination(convertAddressToBytes32(beta)),
          amount: BigInt(amount),
          allocationType: AllocationType.NormalAllocationType,
          metadata: Buffer.alloc(0),
        }),
      ]),
    }),
  ]);
}

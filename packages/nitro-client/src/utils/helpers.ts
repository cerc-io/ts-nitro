import debug from 'debug';

import { JSONbigNative } from '@cerc-io/nitro-util';

import { P2PMessageService } from '../client/engine/messageservice/p2p-message-service/service';
import { Client } from '../client/client';
import { Store } from '../client/engine/store/store';
import { EthChainService } from '../client/engine/chainservice/eth-chainservice';
import { PermissivePolicy } from '../client/engine/policy-maker';
import { Metrics } from '../client/engine/metrics';
import { SingleAssetExit, Exit } from '../channel/state/outcome/exit';
import { Allocation, AllocationType, Allocations } from '../channel/state/outcome/allocation';
import { Destination } from '../types/destination';

const log = debug('ts-nitro:util:helpers');

/**
 * setupClient sets up a client using the given args
 *
 * @param msgPort
 * @param pk
 * @param chainPk
 */
export async function setupClient(
  messageService: P2PMessageService,
  store: Store,
  options: {
    chainPk: string,
    chainURL: string,
    contractAddresses: { [key: string]: string },
  },
  metricsApi?: Metrics,
): Promise<Client> {
  const {
    chainPk,
    chainURL,
    contractAddresses,
  } = options;

  const chainService = await EthChainService.newEthChainService(
    chainURL,
    chainPk,
    contractAddresses.nitroAdjudicatorAddress,
    contractAddresses.consensusAppAddress,
    contractAddresses.virtualPaymentAppAddress,
  );

  const client = await Client.new(
    messageService,
    chainService,
    store,
    undefined,
    new PermissivePolicy(),
    metricsApi,
  );

  return client;
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
        metadata: null,
      },
      allocations: new Allocations([
        new Allocation({
          destination: Destination.addressToDestination(convertAddressToBytes32(alpha)),
          amount: BigInt(amount),
          allocationType: AllocationType.NormalAllocationType,
          metadata: null,
        }),
        new Allocation({
          destination: Destination.addressToDestination(convertAddressToBytes32(beta)),
          amount: BigInt(amount),
          allocationType: AllocationType.NormalAllocationType,
          metadata: null,
        }),
      ]),
    }),
  ]);
}

export async function subscribeVoucherLogs(client: Client): Promise<void> {
  // Log voucher messages from channel in loop
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const voucher = await client.receivedVouchers().shift();

    if (voucher === undefined) {
      break;
    }

    log(`Received voucher: ${JSONbigNative.stringify(voucher, null, 2)}`);
  }
}

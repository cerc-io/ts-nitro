import {
  Allocation, Destination, Exit, SingleAssetExit, AllocationType,
} from '@cerc-io/nitro-client';

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
      allocations: [
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
      ],
    }),
  ]);
}

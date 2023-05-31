import { Destination } from '../../../types/destination';

export class GuaranteeMetadata {
  left: Destination = new Destination();

  right: Destination = new Destination();

  // encode returns the abi.encoded GuaranteeMetadata (suitable for packing in an Allocation.Metadata field)
  // TODO: Implement
  encode(): Buffer {
    return Buffer.alloc(0);
  }

  // Decode returns a GuaranteeMetaData from an abi encoding
  static decodeIntoGuaranteeMetadata(m: Buffer): GuaranteeMetadata {
    //   TODO: Implement and check util method from nitro-protocol

    return new GuaranteeMetadata();
  }
}

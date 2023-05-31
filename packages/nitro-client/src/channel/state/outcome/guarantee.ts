import { Destination } from '../../../types/destination';

export class GuaranteeMetadata {
  left: Destination = new Destination();

  right: Destination = new Destination();

  // Decode returns a GuaranteeMetaData from an abi encoding
  static decodeIntoGuaranteeMetadata(m: Buffer): GuaranteeMetadata {
    //   TODO: Implement and check util method from nitro-protocol

    return new GuaranteeMetadata();
  }
}

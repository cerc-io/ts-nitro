import { decodeGuaranteeData, encodeGuaranteeData } from '@statechannels/nitro-protocol/dist/src/contract/outcome';

import { Destination } from '../../../types/destination';

export class GuaranteeMetadata {
  left: Destination = new Destination();

  right: Destination = new Destination();

  constructor(params: {
    left?: Destination,
    right?: Destination,
  }) {
    Object.assign(this, params);
  }

  // encode returns the abi.encoded GuaranteeMetadata (suitable for packing in an Allocation.Metadata field)
  encode(): Buffer {
    return Buffer.from(
      encodeGuaranteeData({
        left: this.left.value,
        right: this.right.value,
      }).toString(),
    );
  }

  // Decode returns a GuaranteeMetaData from an abi encoding
  static decodeIntoGuaranteeMetadata(m: Buffer): GuaranteeMetadata {
    const { left, right } = decodeGuaranteeData(m.toString());
    return new GuaranteeMetadata({
      left: new Destination(left),
      right: new Destination(right),
    });
  }
}

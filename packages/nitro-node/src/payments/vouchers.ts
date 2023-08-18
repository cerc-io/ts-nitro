// A Voucher signed by Alice can be used by Bob to redeem payments in case of
// a misbehaving Alice.
//
// During normal operation, Alice & Bob would terminate the channel with an
// outcome reflecting the largest amount signed by Alice. For instance,
//   - if the channel started with balances {alice: 100, bob: 0}
//   - and the biggest voucher signed by alice had amount = 20
//   - then Alice and Bob would cooperatively conclude the channel with outcome
//     {alice: 80, bob: 20}

import { ethers } from 'ethers';
import _ from 'lodash';
import { Buffer } from 'buffer';

import { Bytes32, Voucher as NitroVoucher } from '@statechannels/nitro-protocol';
import {
  FieldDescription, NitroSigner, fromJSON, hex2Bytes, toJSON, zeroValueSignature,
} from '@cerc-io/nitro-util';

import { Signature } from '../channel/state/state';
import { Address } from '../types/types';
import { Destination } from '../types/destination';
import * as nc from '../crypto/signatures';

export class Voucher {
  channelId: Destination = new Destination();

  amount?: bigint = undefined;

  signature: Signature = zeroValueSignature;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    channelId: { type: 'class', value: Destination },
    amount: { type: 'bigint' },
    signature: { type: 'signature' },
  };

  static fromJSON(data: string): Voucher {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Voucher(props);
  }

  toJSON(): any {
    return toJSON(Voucher.jsonEncodingMap, this);
  }

  constructor(params: {
    channelId?: Destination;
    amount?: bigint;
    signature?: Signature;
  }) {
    Object.assign(this, params);
  }

  hash(): Bytes32 {
    const voucherTy = {
      type: 'tuple',
      components: [
        { name: 'channelId', type: 'bytes32' },
        {
          name: 'amount',
          type: 'uint256',
        },
      ],
    } as ethers.utils.ParamType;

    const nitroVoucher: NitroVoucher = { channelId: this.channelId.string(), amount: this.amount!.toString() };

    let encoded: string;
    try {
      encoded = ethers.utils.defaultAbiCoder.encode([voucherTy], [nitroVoucher]);
    } catch (err) {
      throw new Error(`failed to encode voucher: ${err}`);
    }

    return ethers.utils.keccak256(encoded);
  }

  async sign(signer: NitroSigner): Promise<void> {
    const hash = this.hash();
    const sig = await nc.signEthereumMessage(Buffer.from(hash), signer);

    this.signature = sig;
  }

  recoverSigner(): Address {
    const hash = this.hash();
    return nc.recoverEthereumMessageSigner(hex2Bytes((hash)), this.signature);
  }

  // Equal returns true if the two vouchers have the same channel id, amount and signatures
  equal(other: Voucher): boolean {
    return _.isEqual(this.channelId, other.channelId)
    && this.amount === other.amount
    && nc.equal(this.signature, other.signature);
  }
}

// VoucherInfo contains the largest voucher we've received on a channel.
// As well as details about the balance and who the payee/payer is.
export class VoucherInfo {
  channelPayer: Address = ethers.constants.AddressZero;

  channelPayee: Address = ethers.constants.AddressZero;

  startingBalance?: bigint = undefined;

  largestVoucher: Voucher = new Voucher({});

  static jsonEncodingMap: Record<string, FieldDescription> = {
    channelPayer: { type: 'address' },
    channelPayee: { type: 'address' },
    startingBalance: { type: 'bigint' },
    largestVoucher: { type: 'class', value: Voucher },
  };

  static fromJSON(data: string): VoucherInfo {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new VoucherInfo(props);
  }

  toJSON(): any {
    return toJSON(VoucherInfo.jsonEncodingMap, this);
  }

  constructor(params: {
    channelPayer?: Address
    channelPayee?: Address
    startingBalance?: bigint
    largestVoucher?: Voucher
  }) {
    Object.assign(this, params);
  }

  // Paid is the amount of funds that already have been used as payments
  paid(): bigint | undefined {
    return this.largestVoucher.amount;
  }

  // Remaining returns the amount of funds left to be used as payments
  remaining(): bigint | undefined {
    return BigInt(this.startingBalance!) - BigInt(this.paid()!);
  }
}

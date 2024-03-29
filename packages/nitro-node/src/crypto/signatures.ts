/* eslint-disable @typescript-eslint/no-use-before-define */
import { ethers } from 'ethers';
import _ from 'lodash';
import { Buffer } from 'buffer';

import {
  JSONbigNative, NitroSigner, bytes2Hex, hex2Bytes,
} from '@cerc-io/nitro-util';

// Signature is an ECDSA signature
export class Signature {
  r: Buffer | null = null;

  s: Buffer | null = null;

  v: number = 0;

  constructor(params: {
    r?: Buffer | null;
    s?: Buffer | null;
    v?: number
  }) {
    Object.assign(this, params);
  }

  static fromJSON(data: string): Signature {
    // Parse the JSON data string
    const jsonValue = JSONbigNative.parse(data);
    const sigBuf = hex2Bytes(jsonValue);

    // If the signature is all zeros, we consider it to be the empty signature
    if (allZero(sigBuf)) {
      return new Signature({});
    }

    if (sigBuf.length !== 65) {
      throw new Error(`signature must be 65 bytes long or a zero string, received ${sigBuf.length} bytes`);
    }

    const recSig = new Signature({
      r: sigBuf.subarray(0, 32),
      s: sigBuf.subarray(32, 64),
      v: Number(sigBuf[64]),
    });

    return recSig;
  }

  toJSON(): any {
    return this.toHexString();
  }

  // ToHexString returns the signature as a hex string
  toHexString(): string {
    const sigHex = {
      r: `0x${bytes2Hex(this.r ?? Buffer.alloc(0))}`,
      s: `0x${bytes2Hex(this.s ?? Buffer.alloc(0))}`,
      v: this.v,
    };

    return ethers.utils.hexlify(ethers.utils.concat([sigHex.r, sigHex.s, [sigHex.v]]));
  }

  equal(s: Signature): boolean {
    return _.isEqual(this.r, s.r)
    && _.isEqual(this.s, s.s)
    && this.v === s.v;
  }
}

// computeEthereumSignedMessageDigest accepts an arbitrary message, prepends a known message,
// and hashes the result using keccak256. The known message added to the input before hashing is
// "\x19Ethereum Signed Message:\n" + len(message).
const computeEthereumSignedMessageDigest = (message: Buffer): Buffer => {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const messageBytes = ethers.utils.concat([
    Buffer.from(prefix),
    message,
  ]);
  return Buffer.from(ethers.utils.keccak256(messageBytes));
};

// SignEthereumMessage accepts an arbitrary message, prepends a known message,
// hashes the result using keccak256 and calculates the secp256k1 signature
// of the hash using the provided secret key. The known message added to the input before hashing is
// "\x19Ethereum Signed Message:\n" + len(message).
// See https://github.com/ethereum/go-ethereum/pull/2940 and EIPs 191, 721.
export const signEthereumMessage = async (message: Buffer, signer: NitroSigner): Promise<Signature> => {
  const sig = await signer.signMessage(message.toString());

  /* eslint-disable @typescript-eslint/no-use-before-define */
  return getSignatureFromEthersSignature(sig);
};

// RecoverEthereumMessageSigner accepts a message (bytestring) and signature generated by SignEthereumMessage.
// It reconstructs the appropriate digest and recovers an address via secp256k1 public key recovery
export const recoverEthereumMessageSigner = (message: Buffer, signature: Signature): string => {
  // This step is necessary to remain compatible with the ecrecover precompile
  const sig = _.cloneDeep(signature);
  if (sig.v >= 27) {
    sig.v -= 27;
  }

  const digest = computeEthereumSignedMessageDigest(message);

  return ethers.utils.recoverAddress(
    digest.toString(),
    {
      r: `0x${bytes2Hex(sig.r ?? Buffer.alloc(0))}`,
      s: `0x${bytes2Hex(sig.s ?? Buffer.alloc(0))}`,
      v: sig.v,
    },
  );
};

// Custom function to get Signature instance from an ethers Signature
export const getSignatureFromEthersSignature = (sig: ethers.Signature): Signature => {
  // This step is necessary to remain compatible with the ecrecover precompile
  return new Signature({
    r: hex2Bytes(sig.r),
    s: hex2Bytes(sig.s),
    v: sig.v < 27 ? sig.v + 27 : sig.v,
  });
};

// allZero returns true if all bytes in the slice are zero false otherwise
function allZero(s: Buffer): boolean {
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== 0) {
      return false;
    }
  }

  return true;
}

// Signature is an ECDSA signature

import { ethers } from 'ethers';

export type Signature = {
  r: string;
  s: string;
  v: number;
};

// computeEthereumSignedMessageDigest accepts an arbitrary message, prepends a known message,
// and hashes the result using keccak256. The known message added to the input before hashing is
// "\x19Ethereum Signed Message:\n" + len(message).
const computeEthereumSignedMessageDigest = (message: Buffer): Buffer => {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const prefixBytes = ethers.utils.toUtf8Bytes(prefix);
  const messageBytes = ethers.utils.arrayify(message);
  const formattedMessage = ethers.utils.concat([prefixBytes, messageBytes]);
  return Buffer.from(ethers.utils.keccak256(formattedMessage));
};

// splitSignature takes a 65 bytes signature in the [R||S||V] format and returns the individual components
const splitSignature = (concatenatedSignature: Buffer): Signature => ethers.utils.splitSignature(concatenatedSignature);

// SignEthereumMessage accepts an arbitrary message, prepends a known message,
// hashes the result using keccak256 and calculates the secp256k1 signature
// of the hash using the provided secret key. The known message added to the input before hashing is
// "\x19Ethereum Signed Message:\n" + len(message).
// See https://github.com/ethereum/go-ethereum/pull/2940 and EIPs 191, 721.
// TODO: Implement
export const signEthereumMessage = async (message: Buffer, secretKey: Buffer): Promise<Signature> => {
  const digest = computeEthereumSignedMessageDigest(message);
  const wallet = new ethers.Wallet(secretKey);
  const concatenatedSignature = await wallet.signMessage(digest);

  const sig = splitSignature(Buffer.from(concatenatedSignature));

  // This step is necessary to remain compatible with the ecrecover precompile
  if (sig.v < 27) {
    sig.v += 27;
  }

  return sig;
};

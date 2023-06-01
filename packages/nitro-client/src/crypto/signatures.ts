// Signature is an ECDSA signature
// TODO: Add fields
export type Signature = {};

// SignEthereumMessage accepts an arbitrary message, prepends a known message,
// hashes the result using keccak256 and calculates the secp256k1 signature
// of the hash using the provided secret key. The known message added to the input before hashing is
// "\x19Ethereum Signed Message:\n" + len(message).
// See https://github.com/ethereum/go-ethereum/pull/2940 and EIPs 191, 721.
// TODO: Implement
export const signEthereumMessage = (message: Buffer, secretKey: Buffer): Signature => ({});

// computeEthereumSignedMessageDigest accepts an arbitrary message, prepends a known message,
// and hashes the result using keccak256. The known message added to the input before hashing is
// "\x19Ethereum Signed Message:\n" + len(message).
// TODO: Implement
const computeEthereumSignedMessageDigest = (message: Buffer): Buffer => Buffer.alloc(0);

// splitSignature takes a 65 bytes signature in the [R||S||V] format and returns the individual components
const splitSignature = (concatenatedSignature: Buffer): Signature => ({});

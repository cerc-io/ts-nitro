import { ethers } from 'ethers';

// To encode objects as bytes, we need to export construct an encoder, using abi.Arguments.
// An instance of abi.Arguments implements two functions relevant to us:
//  - `Pack`, which packs go values for a given struct into bytes.
//  - `unPack`, which unpacks bytes into go values
// To export construct an abi.Arguments instance, we need to supply an array of "types", which are
// actually go values. The following types are used when encoding a state

// String is the String type for abi encoding
export const String = ethers.utils.ParamType.from('string');

// Uint256 is the Uint256 type for abi encoding
export const Uint256 = ethers.utils.ParamType.from('uint256');

// Bytes32 is the Bytes32 type for abi encoding
export const Bytes32 = ethers.utils.ParamType.from('bytes32');

// Bool is the bool type for abi encoding
export const Bool = ethers.utils.ParamType.from('bool');

// Destination is the bytes32 type for abi encoding
export const Destination = Bytes32;

// Bytes is the bytes type for abi encoding
export const Bytes = ethers.utils.ParamType.from('bytes');

// AddressArray is the address[] type for abi encoding
export const AddressArray = ethers.utils.ParamType.from('address[]');

// Address is the Address type for abi encoding
export const Address = ethers.utils.ParamType.from('address');

import { Bytes32 } from '@statechannels/nitro-protocol';

export type Address = string;

// Destination represents a payable address in go-nitro. In a state channel network,
// payable address are either:
//   - Internal: a 32-byte nitro channel ID, or
//   - External: a blockchain account or contract address, left-padded with 0s
export type Destination = Bytes32;

// A {tokenAddress: amount} map. Address 0 represents a chain's native token (ETH, FIL, etc)
export type Funds = Map<Address, bigint>;

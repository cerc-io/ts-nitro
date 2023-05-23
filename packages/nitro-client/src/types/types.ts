import { AddressLike } from 'ethers';

export type Address = AddressLike;

// A {tokenAddress: amount} map. Address 0 represents a chain's native token (ETH, FIL, etc)
export type Funds = Map<Address, bigint>;

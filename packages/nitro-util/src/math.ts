import { ethers } from 'ethers';

// Random integer in range [0 - 2^64)
export function randUint64(): string {
  // Generate 8 random bytes
  const randomBytes = ethers.utils.randomBytes(8);
  const randomUint64 = ethers.BigNumber.from(randomBytes);

  return randomUint64.toString();
}

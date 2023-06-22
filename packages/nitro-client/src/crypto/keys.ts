import { ethers } from 'ethers';

import { Address } from '../types/types';

// GetAddressFromSecretKeyBytes computes the Ethereum address corresponding to the supplied private key.
export function getAddressFromSecretKeyBytes(secretKeyBytes: Buffer): Address {
  const wallet = new ethers.Wallet(secretKeyBytes);
  return wallet.address.toLowerCase();
}

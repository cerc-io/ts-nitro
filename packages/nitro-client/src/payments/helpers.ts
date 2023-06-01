import { Address } from '../types/types';

export const PAYER_INDEX = 0;

// GetPayer returns the payer on a payment channel
export const getPayer = (participants: Address[]): Address => participants[PAYER_INDEX];

// GetPayee returns the payee on a payment channel
const getPayee = (participants: Address[]): Address => participants[participants.length - 1];

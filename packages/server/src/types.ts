import { Exit } from '@cerc-io/nitro-node';

/**
 * Objective params
 */
export type DirectFundParams = {
  counterParty: string;
  challengeDuration: number;
  outcome: Exit;
  nonce: number;
  appDefinition: string;
  appData: string;
};

export type VirtualFundParams = {
  intermediaries: string[];
  counterParty: string;
  challengeDuration: number;
  outcome: Exit;
  nonce: number;
  appDefinition: string;
};

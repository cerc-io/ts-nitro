import { Exit } from '@cerc-io/nitro-client';

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

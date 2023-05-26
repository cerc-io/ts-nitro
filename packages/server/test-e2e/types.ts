import { Exit } from '@cerc-io/nitro-client';

/**
 * Objective params
 */
export type DirectFundParams = {
  CounterParty: string;
  ChallengeDuration: number;
  Outcome: Exit;
  Nonce: number;
  AppDefinition: string;
  AppData: string;
};

import { Funds } from '../types/types';
import { SignedState } from './state/signedstate';
import { FixedPart } from './state/state';

// Channel contains states and metadata and exposes convenience methods.
// TODO: Implement
export class Channel extends FixedPart {
  id?: string;

  // TODO: unit replacement
  myIndex?: number;

  onChainFunding?: Funds;

  // Support []uint64 // TODO: this property will be important, and allow the Channel to store the necessary data to close out the channel on chain
  // It could be an array of turnNums, which can be used to slice into Channel.SignedStateForTurnNum

  // TODO: unit64 replacement
  signedStateForTurnNum?: Map<number, SignedState>;
  // Longer term, we should have a more efficient and smart mechanism to store states https://github.com/statechannels/go-nitro/issues/106

  // largest uint64 value reserved for "no supported state"
  // TODO: unit64 replacement
  latestSupportedStateTurnNum?: number;
}

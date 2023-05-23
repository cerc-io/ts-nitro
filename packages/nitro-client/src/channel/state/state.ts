import { Address } from '../../types/types';
import { Exit } from './outcome/exit';

// State holds all of the data describing the state of a channel
export class State {
  participants?: Address[];

  // TODO: unit64 replacement
  channelNonce?: number;

  appDefinition?: Address;

  // TODO: unit64 replacement
  challengeDuration?: number;

  appData?: Buffer;

  outcome?: Exit;

  // TODO: unit64 replacement
  turnNum? : number;

  isFinal?: boolean;
}

// FixedPart contains the subset of State data which does not change during a state update.
export class FixedPart {
  participants?: Address[];

  // TODO: unit64 replacement
  channelNonce?: number;

  appDefinition?: Address;

  // TODO: unit64 replacement
  challengeDuration?: number;
}

// VariablePart contains the subset of State data which can change with each state update.
export class VariablePart {
  appData?: Buffer;

  outcome?: Exit;

  // TODO: unit64 replacement
  turnNum? : number;

  isFinal?: boolean;
}

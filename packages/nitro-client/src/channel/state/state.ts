import { ethers } from 'ethers';

import { Signature } from '../../crypto/signatures';
import { Address } from '../../types/types';
import { Exit } from './outcome/exit';

// FixedPart contains the subset of State data which does not change during a state update.
export class FixedPart {
  participants?: Address[];

  // TODO: unit64 replacement
  channelNonce?: number;

  appDefinition?: Address;

  // TODO: unit64 replacement
  challengeDuration?: number;

  channelId(): string {
    return '';
  }

  // Clone returns a deep copy of the receiver.
  clone(): FixedPart {
    return {} as FixedPart;
  }

  // Validate checks whether the receiver is malformed and returns an error if it is.
  // TODO: Can throw an error
  validate(): void {}
}

// VariablePart contains the subset of State data which can change with each state update.
export class VariablePart {
  appData?: Buffer;

  outcome?: Exit;

  // TODO: unit64 replacement
  turnNum? : number;

  isFinal?: boolean;
}

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

  // FixedPart returns the FixedPart of the State
  fixedPart(): FixedPart {
    return new FixedPart();
  }

  // VariablePart returns the VariablePart of the State
  variablePart(): VariablePart {
    return new VariablePart();
  }

  // ChannelId computes and returns the channel id corresponding to the State,
  // and an error if the id is an external destination.
  //
  // Up to hash collisions, ChannelId distinguishes channels that have different FixedPart
  // values
  channelId(): string {
    return this.fixedPart().channelId();
  }

  // encodes the state into a []bytes value
  // TODO: Can throw an error
  encode(): Buffer {
    return Buffer.from('');
  }

  // Hash returns the keccak256 hash of the State
  // TODO: Can throw an error
  hash(): string {
    return '';
  }

  // Sign generates an ECDSA signature on the state using the supplied private key
  // The state hash is prepended with \x19Ethereum Signed Message:\n32 and then rehashed
  // to create a digest to sign
  // TODO: Can throw an error
  sign(secretKey: Buffer): Signature {
    return {};
  }

  // RecoverSigner computes the Ethereum address which generated Signature sig on State state
  // TODO: Can throw an error
  recoverSigner(sig: Signature): Address {
    return ethers.ZeroAddress;
  }

  // Equal returns true if the given State is deeply equal to the receiever.
  equal(r: State): boolean {
    return false;
  }

  // Validate checks whether the state is malformed and returns an error if it is.
  // TODO: Can throw an error
  validate(): void {}

  // Clone returns a deep copy of the receiver.
  clone(): State {
    return {} as State;
  }
}

// equalParticipants returns true if the given arrays contain equal addresses (in the same order).
function equalParticipants(p: Address[], q: Address[]): boolean {
  return false;
}

// StateFromFixedAndVariablePart constructs a State from a FixedPart and a VariablePart
export function stateFromFixedAndVariablePart(f: FixedPart, v: VariablePart): State {
  return {} as State;
}

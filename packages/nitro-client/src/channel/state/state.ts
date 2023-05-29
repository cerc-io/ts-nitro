import { ethers } from 'ethers';

import { getChannelId as utilGetChannelId } from '@statechannels/nitro-protocol';

import assert from 'assert';
import { Signature } from '../../crypto/signatures';
import { Address } from '../../types/types';
import { Destination } from '../../types/destination';
import { Exit } from './outcome/exit';

// FixedPart contains the subset of State data which does not change during a state update.
export class FixedPart {
  participants: Address[];

  // TODO: unit64 replacement
  channelNonce: string;

  appDefinition: Address;

  // TODO: unit64 replacement
  challengeDuration: number;

  constructor(
    participants: Address[],
    channelNonce: string,
    challengeDuration: number,
    appDefinition: Address = '',
  ) {
    this.participants = participants;
    this.channelNonce = channelNonce;
    this.challengeDuration = challengeDuration;
    this.appDefinition = appDefinition;
  }

  // TODO: Implement
  channelId(): Destination {
    // TODO: Find nitro-protocol package util method
    return new Destination('');
  }

  getChannelId(): Destination {
    return new Destination(utilGetChannelId(this));
  }

  // Clone returns a deep copy of the receiver.
  // TODO: Implement
  clone(): FixedPart {
    return {} as FixedPart;
  }

  // Validate checks whether the receiver is malformed and returns an error if it is.
  // TODO: Can throw an error
  // TODO: Implement
  validate(): Error | null {
    if (this.channelId().isExternal()) {
      return new Error('channelId is an external destination'); // This is extremely unlikely
    }

    return null;
  }
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
  participants: Address[] = [];

  channelNonce: string = '';

  appDefinition: Address = '';

  challengeDuration: number = 0;

  appData: Buffer = Buffer.alloc(0);

  outcome: Exit = new Exit([]);

  // TODO: unit64 replacement
  turnNum : number = 0;

  isFinal: boolean = false;

  constructor(
    params: {
      participants: Address[],
      channelNonce: string,
      appDefinition: Address,
      challengeDuration: number,
      appData: Buffer,
      outcome: Exit,
      turnNum: number,
      isFinal: boolean
    },
  ) {
    Object.assign(this, params);
  }

  // FixedPart returns the FixedPart of the State
  fixedPart(): FixedPart {
    return new FixedPart(
      this.participants,
      this.channelNonce,
      this.challengeDuration,
      this.appDefinition,
    );
  }

  // VariablePart returns the VariablePart of the State
  // TODO: Implement
  variablePart(): VariablePart {
    return new VariablePart();
  }

  // ChannelId computes and returns the channel id corresponding to the State,
  // and an error if the id is an external destination.
  //
  // Up to hash collisions, ChannelId distinguishes channels that have different FixedPart
  // values
  // TODO: Implement
  channelId(): Destination {
    return this.fixedPart().channelId();
  }

  // encodes the state into a []bytes value
  // TODO: Can throw an error
  // TODO: Implement
  encode(): Buffer {
    return Buffer.from('');
  }

  // Hash returns the keccak256 hash of the State
  // TODO: Can throw an error
  // TODO: Implement
  hash(): string {
    return '';
  }

  // Sign generates an ECDSA signature on the state using the supplied private key
  // The state hash is prepended with \x19Ethereum Signed Message:\n32 and then rehashed
  // to create a digest to sign
  // TODO: Can throw an error
  // TODO: Implement
  sign(secretKey: Buffer): Signature {
    return {};
  }

  // RecoverSigner computes the Ethereum address which generated Signature sig on State state
  // TODO: Can throw an error
  // TODO: Implement
  recoverSigner(sig: Signature): Address {
    return ethers.constants.AddressZero;
  }

  // Equal returns true if the given State is deeply equal to the receiever.
  // TODO: Implement
  equal(r: State): boolean {
    return false;
  }

  // Validate checks whether the state is malformed and returns an error if it is.
  // TODO: Can throw an error
  // TODO: Implement
  validate(): void {}

  // Clone returns a deep copy of the receiver.
  // TODO: Implement
  clone(): State {
    return {} as State;
  }
}

// equalParticipants returns true if the given arrays contain equal addresses (in the same order).
// TODO: Implement
function equalParticipants(p: Address[], q: Address[]): boolean {
  return false;
}

// StateFromFixedAndVariablePart constructs a State from a FixedPart and a VariablePart
// TODO: Implement
export function stateFromFixedAndVariablePart(f: FixedPart, v: VariablePart): State {
  return {} as State;
}

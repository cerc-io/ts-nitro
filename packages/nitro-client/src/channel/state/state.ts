import { ethers } from 'ethers';

import { getChannelId as utilGetChannelId } from '@statechannels/nitro-protocol';
import { zeroValueSignature } from '@cerc-io/nitro-util';

import * as nc from '../../crypto/signatures';
import { Address } from '../../types/types';
import { Destination } from '../../types/destination';
import { Exit } from './outcome/exit';

export type Signature = nc.Signature;

export interface ConstructorOptions {
  participants?: Address[];
  channelNonce?: string;
  appDefinition?: Address;
  challengeDuration?: number;
}

// FixedPart contains the subset of State data which does not change during a state update.
export class FixedPart {
  participants: Address[] = [];

  // TODO: unit64 replacement
  channelNonce: string = '0';

  appDefinition: Address = ethers.constants.AddressZero;

  // TODO: unit64 replacement
  challengeDuration: number = 0;

  constructor(params: ConstructorOptions) {
    Object.assign(this, params);
  }

  channelId(): Destination {
    return new Destination(utilGetChannelId(this));
  }

  // Clone returns a deep copy of the receiver.
  // TODO: Implement
  clone(): FixedPart {
    return {} as FixedPart;
  }

  // Validate checks whether the receiver is malformed and returns an error if it is.
  validate(): void {
    if (this.channelId().isExternal()) {
      throw new Error('channelId is an external destination'); // This is extremely unlikely
    }
  }
}

// VariablePart contains the subset of State data which can change with each state update.
export class VariablePart {
  appData: Buffer = Buffer.alloc(0);

  outcome?: Exit;

  // TODO: unit64 replacement
  turnNum : number = 0;

  isFinal: boolean = false;
}

// State holds all of the data describing the state of a channel
export class State {
  participants: Address[] = [];

  channelNonce: string = '0';

  appDefinition: Address = '';

  challengeDuration: number = 0;

  appData: Buffer = Buffer.alloc(0);

  outcome: Exit = new Exit([]);

  // TODO: unit64 replacement
  turnNum : number = 0;

  isFinal: boolean = false;

  constructor(
    params: {
      participants?: Address[],
      channelNonce?: string,
      appDefinition?: Address,
      challengeDuration?: number,
      appData?: Buffer,
      outcome?: Exit,
      turnNum?: number,
      isFinal?: boolean
    },
  ) {
    Object.assign(this, params);
  }

  // FixedPart returns the FixedPart of the State
  fixedPart(): FixedPart {
    return new FixedPart({
      participants: this.participants,
      channelNonce: this.channelNonce,
      challengeDuration: this.challengeDuration,
      appDefinition: this.appDefinition,
    });
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
  sign(secretKey: Buffer): Signature {
    // TODO: Implement
    return zeroValueSignature;
  }

  // RecoverSigner computes the Ethereum address which generated Signature sig on State state
  recoverSigner(sig: Signature): Address {
    const stateHash = this.hash();
    return nc.recoverEthereumMessageSigner(Buffer.from(stateHash), sig);
  }

  // Equal returns true if the given State is deeply equal to the receiever.
  // TODO: Implement
  equal(r: State): boolean {
    return false;
  }

  // Validate checks whether the state is malformed and returns an error if it is.
  validate(): void {
    return this.fixedPart().validate();
  }

  // Clone returns a deep copy of the receiver.
  clone(): State {
    const clone = new State({});

    // Fixed part
    const cloneFixedPart = this.fixedPart().clone();
    clone.participants = cloneFixedPart.participants;
    clone.channelNonce = cloneFixedPart.channelNonce;
    clone.appDefinition = cloneFixedPart.appDefinition;
    clone.challengeDuration = cloneFixedPart.challengeDuration;

    // Variable part
    if (this.appData) {
      clone.appData = Buffer.alloc(this.appData.length);
      clone.appData = Buffer.from(this.appData);
    }
    clone.outcome = this.outcome.clone();
    clone.turnNum = this.turnNum;
    clone.isFinal = this.isFinal;

    return clone;
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

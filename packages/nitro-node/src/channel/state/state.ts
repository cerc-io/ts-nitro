import { ethers } from 'ethers';
import _ from 'lodash';
import { Buffer } from 'buffer';

import type * as ExitFormat from '@statechannels/exit-format';
import {
  getChannelId as utilGetChannelId,
  State as NitroState,
  hashState as utilHashState,
} from '@cerc-io/nitro-protocol';
import {
  FieldDescription, NitroSigner, Uint64, bytes2Hex, fromJSON, hex2Bytes, toJSON,
} from '@cerc-io/nitro-util';

import * as nc from '../../crypto/signatures';
import { Signature } from '../../crypto/signatures';
import { Address } from '../../types/types';
import { Destination } from '../../types/destination';
import { Exit } from './outcome/exit';

export { Signature } from '../../crypto/signatures';

export interface ConstructorOptions {
  participants?: Address[] | null;
  channelNonce?: Uint64;
  appDefinition?: Address;
  challengeDuration?: number;
}

// FixedPart contains the subset of State data which does not change during a state update.
export class FixedPart {
  participants: Address[] | null = null;

  channelNonce: Uint64 = BigInt(0);

  appDefinition: Address = ethers.constants.AddressZero;

  challengeDuration: number = 0;

  constructor(params: ConstructorOptions) {
    Object.assign(this, params);
  }

  static jsonEncodingMap: Record<string, FieldDescription> = {
    participants: { type: 'array', value: { type: 'address' } },
    channelNonce: { type: 'uint64' },
    appDefinition: { type: 'address' },
    challengeDuration: { type: 'number' },
  };

  static fromJSON(data: string): FixedPart {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new FixedPart(props);
  }

  toJSON(): any {
    return toJSON(FixedPart.jsonEncodingMap, this);
  }

  channelId(): Destination {
    return new Destination(utilGetChannelId({ ...this, channelNonce: this.channelNonce.toString(), participants: this.participants ?? [] }));
  }

  // Clone returns a deep copy of the receiver.
  clone(): FixedPart {
    const clone = new FixedPart({});
    clone.participants = this.participants;
    clone.channelNonce = this.channelNonce;
    clone.appDefinition = this.appDefinition;
    clone.challengeDuration = this.challengeDuration;

    return clone;
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
  appData: Buffer | null = null;

  outcome: Exit = new Exit();

  turnNum: Uint64 = BigInt(0);

  isFinal: boolean = false;

  constructor(
    params: {
      appData?: Buffer | null,
      outcome?: Exit,
      turnNum?: Uint64,
      isFinal?: boolean
    },
  ) {
    Object.assign(this, params);
  }
}

// State holds all of the data describing the state of a channel
export class State {
  participants: Address[] | null = null;

  channelNonce: Uint64 = BigInt(0);

  appDefinition: Address = ethers.constants.AddressZero;

  challengeDuration: number = 0;

  appData: Buffer | null = null;

  outcome: Exit = new Exit();

  turnNum : Uint64 = BigInt(0);

  isFinal: boolean = false;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    participants: { type: 'array', value: { type: 'address' } },
    channelNonce: { type: 'uint64' },
    appDefinition: { type: 'address' },
    challengeDuration: { type: 'number' },
    appData: { type: 'buffer' },
    outcome: { type: 'class', value: Exit },
    turnNum: { type: 'uint64' },
    isFinal: { type: 'boolean' },
  };

  static fromJSON(data: string): State {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new State(props);
  }

  toJSON(): any {
    return toJSON(State.jsonEncodingMap, this);
  }

  constructor(
    params: {
      participants?: Address[] | null,
      channelNonce?: Uint64,
      appDefinition?: Address,
      challengeDuration?: number,
      appData?: Buffer | null,
      outcome?: Exit,
      turnNum?: Uint64,
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
  variablePart(): VariablePart {
    return new VariablePart({
      appData: this.appData,
      outcome: this.outcome,
      turnNum: this.turnNum,
      isFinal: this.isFinal,
    });
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
  // TODO: Implement (only if required)
  encode(): Buffer {
    return Buffer.from('');
  }

  // Hash returns the keccak256 hash of the State
  hash(): string {
    // Use hashState method from @statechannels/nitro-protocol
    // Create NitroState instance from State
    const state: NitroState = this._getNitroState();
    return utilHashState(state);
  }

  // Sign generates an ECDSA signature on the state using the supplied private key
  // The state hash is prepended with \x19Ethereum Signed Message:\n32 and then rehashed
  // to create a digest to sign
  async sign(signer: NitroSigner): Promise<Signature> {
    const hash = this.hash();
    return nc.signEthereumMessage(Buffer.from(hash), signer);
  }

  // RecoverSigner computes the Ethereum address which generated Signature sig on State state
  recoverSigner(sig: Signature): Address {
    const stateHash = this.hash();
    return nc.recoverEthereumMessageSigner(hex2Bytes(stateHash), sig);
  }

  // Equal returns true if the given State is deeply equal to the receiever.
  equal(r: State): boolean {
    /* eslint-disable @typescript-eslint/no-use-before-define */
    return equalParticipants(this.participants, r.participants)
    && this.channelNonce === r.channelNonce
    && this.appDefinition === r.appDefinition
    && this.challengeDuration === r.challengeDuration
    && _.isEqual(this.appData, r.appData)
    && this.outcome.equal(r.outcome)
    && this.turnNum === r.turnNum
    && this.isFinal === r.isFinal;
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

  // Custom method to create NitroState instance from state
  _getNitroState(): NitroState {
    const stateOutcome: ExitFormat.Exit = (this.outcome.value ?? []).map((singleAssetExit): ExitFormat.SingleAssetExit => {
      return {
        asset: singleAssetExit.asset,
        allocations: (singleAssetExit.allocations.value ?? []).map((allocation) => {
          return {
            destination: allocation.destination.value,
            amount: allocation.amount!.toString(),
            allocationType: allocation.allocationType,
            metadata: `0x${bytes2Hex(allocation.metadata ?? Buffer.alloc(0))}`,
          };
        }),
        assetMetadata: {
          assetType: singleAssetExit.assetMetadata.assetType,
          metadata: `0x${bytes2Hex(singleAssetExit.assetMetadata.metadata ?? Buffer.alloc(0))}`,
        },
      };
    });

    return {
      participants: this.participants ?? [],
      channelNonce: this.channelNonce.toString(),
      appDefinition: this.appDefinition,
      challengeDuration: this.challengeDuration,
      outcome: stateOutcome,
      appData: `0x${bytes2Hex(this.appData ?? Buffer.alloc(0))}`,
      turnNum: Number(this.turnNum),
      isFinal: this.isFinal,
    };
  }
}

// equalParticipants returns true if the given arrays contain equal addresses (in the same order).
function equalParticipants(p: Address[] | null, q: Address[] | null): boolean {
  return _.isEqual(p, q);
}

// StateFromFixedAndVariablePart constructs a State from a FixedPart and a VariablePart
export function stateFromFixedAndVariablePart(f: FixedPart, v: VariablePart): State {
  return new State({
    participants: f.participants,
    channelNonce: f.channelNonce,
    appDefinition: f.appDefinition,
    challengeDuration: f.challengeDuration,
    appData: v.appData,
    outcome: v.outcome,
    turnNum: v.turnNum,
    isFinal: v.isFinal,
  });
}

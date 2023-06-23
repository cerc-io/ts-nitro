import { ethers } from 'ethers';
import _ from 'lodash';

import * as ExitFormat from '@statechannels/exit-format';
import {
  getChannelId as utilGetChannelId,
  State as NitroState,
  hashState as utilHashState,
} from '@statechannels/nitro-protocol';
import {
  FieldDescription, Uint64, bytes2Hex, fromJSON, hex2Bytes, toJSON,
} from '@cerc-io/nitro-util';

import * as nc from '../../crypto/signatures';
import { Address } from '../../types/types';
import { Destination } from '../../types/destination';
import { Exit } from './outcome/exit';

export type Signature = nc.Signature;

export interface ConstructorOptions {
  participants?: Address[];
  channelNonce?: Uint64;
  appDefinition?: Address;
  challengeDuration?: number;
}

// FixedPart contains the subset of State data which does not change during a state update.
export class FixedPart {
  participants: Address[] = [];

  channelNonce: Uint64 = BigInt(0);

  appDefinition: Address = ethers.constants.AddressZero;

  // TODO: uint32 replacement
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
    return new Destination(utilGetChannelId({ ...this, channelNonce: this.channelNonce.toString() }));
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
  appData: Buffer = Buffer.alloc(0);

  outcome: Exit = new Exit([]);

  turnNum: Uint64 = BigInt(0);

  isFinal: boolean = false;

  constructor(
    params: {
      appData?: Buffer,
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
  participants: Address[] = [];

  channelNonce: Uint64 = BigInt(0);

  appDefinition: Address = '';

  // TODO: uint32 replacement
  challengeDuration: number = 0;

  appData: Buffer = Buffer.alloc(0);

  outcome: Exit = new Exit([]);

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
      participants?: Address[],
      channelNonce?: Uint64,
      appDefinition?: Address,
      challengeDuration?: number,
      appData?: Buffer,
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
      appData: Buffer.from(this.appData),
      outcome: _.cloneDeep(this.outcome),
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
  // TODO: Can throw an error
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
  sign(secretKey: Buffer): Signature {
    const hash = this.hash();
    return nc.signEthereumMessage(Buffer.from(hash), secretKey);
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
    && this.appData.compare(r.appData) === 0
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
    const stateOutcome: ExitFormat.Exit = this.outcome.value.map((singleAssetExit): ExitFormat.SingleAssetExit => {
      // Use 0x if empty as ethersjs doesn't accept '' as valid value
      // @statechannels/nitro-protocol uses string for Bytes
      let exitMetadata = bytes2Hex(singleAssetExit.assetMetadata.metadata);
      exitMetadata = exitMetadata === '' ? '0x' : exitMetadata;

      return {
        asset: singleAssetExit.asset,
        allocations: singleAssetExit.allocations.value.map((allocation) => {
          let allocationMetadata = bytes2Hex(allocation.metadata);
          allocationMetadata = allocationMetadata === '' ? '0x' : allocationMetadata;

          return {
            destination: allocation.destination.value,
            amount: allocation.amount.toString(),
            allocationType: allocation.allocationType,
            metadata: allocationMetadata,
          };
        }),
        assetMetadata: {
          assetType: singleAssetExit.assetMetadata.assetType,
          metadata: exitMetadata,
        },
      };
    });

    let stateAppData = bytes2Hex(this.appData);
    stateAppData = stateAppData === '' ? '0x' : stateAppData;

    return {
      participants: this.participants,
      channelNonce: this.channelNonce.toString(),
      appDefinition: this.appDefinition,
      challengeDuration: this.challengeDuration,
      outcome: stateOutcome,
      appData: stateAppData,
      turnNum: Number(this.turnNum),
      isFinal: this.isFinal,
    };
  }
}

// equalParticipants returns true if the given arrays contain equal addresses (in the same order).
function equalParticipants(p: Address[], q: Address[]): boolean {
  if (p.length !== q.length) {
    return false;
  }

  for (let i = 0; i < p.length; i += 1) {
    if (p[i] !== q[i]) {
      return false;
    }
  }

  return true;
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

import _ from 'lodash';
import { Buffer } from 'buffer';

import {
  FieldDescription, Uint, Uint64, fromJSON, toJSON,
} from '@cerc-io/nitro-util';

import { Signature, equal } from '../../crypto/signatures';
import { State } from './state';
import { Address } from '../../types/types';
import { Destination } from '../../types/destination';

export class SignedState {
  private _state: State = new State({});

  private sigs: Map<Uint, Signature> = new Map(); // keyed by participant index

  static jsonEncodingMap: Record<string, FieldDescription> = {
    state: { type: 'class', value: State },
    sigs: { type: 'map', key: { type: 'uint' }, value: { type: 'signature' } },
  };

  static fromJSON(data: string): SignedState {
    const props = fromJSON(this.jsonEncodingMap, data, new Map([['state', '_state']]));
    return new SignedState(props);
  }

  toJSON(): any {
    return toJSON(SignedState.jsonEncodingMap, this, new Map([['_state', 'state']]));
  }

  constructor(params: {
    _state?: State,
    sigs?: Map<Uint, Signature>
  }) {
    Object.assign(this, params);
  }

  // newSignedState initializes a SignedState struct for the given
  // The signedState returned will have no signatures.
  static newSignedState(s: State): SignedState {
    return new SignedState({
      _state: _.cloneDeep(s),
      sigs: new Map(),
    });
  }

  // AddSignature adds a participant's signature to the SignedState.
  //
  // An error is returned if
  //   - the signer is not a participant, or
  //   - OR the signature was already stored
  addSignature(sig: Signature): void {
    let signer: Address;
    try {
      signer = this.state().recoverSigner(sig);
    } catch (err) {
      throw new Error('AddSignature failed to recover signer');
    }

    for (let i = 0; i < (this.state().participants ?? []).length; i += 1) {
      const p = this.state().participants![i];

      if (p === signer) {
        const found = this.sigs.has(BigInt(i));
        if (found) {
          throw new Error('Signature already exists for participant');
        } else {
          this.sigs.set(BigInt(i), sig);
          return;
        }
      }
    }

    throw new Error('Signature does not match any participant');
  }

  // State returns the State part of the SignedState.
  state(): State {
    return this._state;
  }

  // Signatures returns a slice of the signatures stored in the SignedState.
  // There will be one signature per participant, in order of channel's Participants.
  // Returned signatures are expected either to be valid or zero-valued.
  signatures(): Signature[] {
    const sigs: Signature[] = [];
    for (let i = 0; i < (this._state.participants ?? []).length; i += 1) {
      sigs.push(this.sigs.get(BigInt(i))!);
    }
    return sigs;
  }

  // HasSignatureForParticipant returns true if the participant (at participantIndex) has a valid signature.
  hasSignatureForParticipant(participantIndex: Uint): boolean {
    const found = this.sigs.has(participantIndex);
    return found;
  }

  // HasAllSignatures returns true if every participant has a valid signature.
  hasAllSignatures(): boolean {
    // Since signatures are validated
    if (this.sigs.size === (this.state().participants ?? []).length) {
      return true;
    }
    return false;
  }

  // GetParticipantSignature returns the signature for the participant specified by participantIndex
  getParticipantSignature(participantIndex: Uint): Signature {
    const found = this.sigs.has(participantIndex);
    if (!found) {
      throw new Error(`participant ${participantIndex} does not have a signature`);
    } else {
      return this.sigs.get(participantIndex)!;
    }
  }

  // Merge checks the passed SignedState's state and the receiver's state for equality, and adds each signature from the former to the latter.
  merge(ss2: SignedState): void {
    if (!this._state.equal(ss2._state)) {
      throw new Error('cannot merge signed states with distinct state hashes');
    }

    for (const [i, sig] of ss2.sigs) {
      const existing = this.sigs.get(i);
      if (existing) { // if the signature is already present, check that it is the same
        if (!equal(existing, sig)) {
          throw new Error('cannot merge signed states with conflicting signatures');
        }
      } else { // otherwise add the signature
        this.addSignature(sig);
      }
    }
  }

  // Clone returns a deep copy of the receiver.
  clone(): SignedState {
    const clonedSigs: Map<Uint, Signature> = new Map<Uint, Signature>();
    for (const [i, ss] of this.sigs) {
      clonedSigs.set(BigInt(i), _.cloneDeep(ss));
    }
    return new SignedState({ _state: this._state.clone(), sigs: clonedSigs });
  }

  // MarshalJSON marshals the SignedState into JSON, implementing the Marshaler interface.
  marshalJSON(): Buffer {
    // Use toJSON method
    return Buffer.from('');
  }

  // UnmarshalJSON unmarshals the passed JSON into a SignedState, implementing the Unmarshaler interface.
  // Use SignedState.fromJSON
  unmarshalJSON(j: Buffer): void {}

  // ChannelId returns the channel id of the state.
  channelId(): Destination {
    const cId = this._state.channelId();
    return cId;
  }

  // SortInfo returns the channel id and turn number of the state, so the state can be easily sorted.
  sortInfo(): [Destination, Uint64] {
    const cId = this._state.channelId();
    const { turnNum } = this._state;
    return [cId, turnNum];
  }
}

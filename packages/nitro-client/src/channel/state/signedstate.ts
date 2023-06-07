import assert from 'assert';

import {
  FieldDescription, fromJSON, toJSON, zeroValueSignature,
} from '@cerc-io/nitro-util';

import { Signature, signatureJsonEncodingMap } from '../../crypto/signatures';
import { State } from './state';
import { Address } from '../../types/types';

export class SignedState {
  private _state: State = new State({});

  // TODO: uint replacement
  private sigs: Map<number, Signature> = new Map(); // keyed by participant index

  static jsonEncodingMap: Record<string, FieldDescription> = {
    _state: { type: 'class', value: State },
    sigs: { type: 'map', key: { type: 'number' }, value: { type: 'object', value: signatureJsonEncodingMap } },
  };

  static fromJSON(data: string): SignedState {
    const jsonValue = JSON.parse(data);
    const props = fromJSON(this.jsonEncodingMap, jsonValue);

    return new SignedState(props);
  }

  toJSON(): any {
    return toJSON(SignedState.jsonEncodingMap, this);
  }

  constructor(params: {
    _state?: State,
    sigs?: Map<number, Signature>
  }) {
    Object.assign(this, params);
  }

  // newSignedState initializes a SignedState struct for the given
  // The signedState returned will have no signatures.
  static newSignedState(s: State): SignedState {
    return new SignedState({
      _state: s,
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
      // TODO: Implement
      signer = this.state().recoverSigner(sig);
    } catch (err) {
      throw new Error('AddSignature failed to recover signer');
    }

    for (let i = 0; i < this.state().participants.length; i += 1) {
      const p = this.state().participants[i];

      if (p === signer) {
        const found = this.sigs!.has(i);
        if (found) {
          throw new Error('Signature already exists for participant');
        } else {
          this.sigs!.set(i, sig);
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
  // TODO: Implement
  signatures(): Signature[] {
    return [];
  }

  // HasSignatureForParticipant returns true if the participant (at participantIndex) has a valid signature.
  // TODO: unit replacement
  // TODO: Implement
  hasSignatureForParticipant(participantIndex: number): boolean {
    return false;
  }

  // HasAllSignatures returns true if every participant has a valid signature.
  hasAllSignatures(): boolean {
    // Since signatures are validated
    if (this.sigs.size === this.state().participants.length) {
      return true;
    }
    return false;
  }

  // GetParticipantSignature returns the signature for the participant specified by participantIndex
  // TODO: Can throw an error
  // TODO: Implement
  getParticipantSignature(participantIndex: number): Signature {
    return zeroValueSignature;
  }

  // Merge checks the passed SignedState's state and the receiver's state for equality, and adds each signature from the former to the latter.
  // TODO: Can throw an error
  // TODO: Implement
  merge(ss2: SignedState): void {}

  // Clone returns a deep copy of the receiver.
  // TODO: Implement
  clone(): SignedState {
    return {} as SignedState;
  }

  // MarshalJSON marshals the SignedState into JSON, implementing the Marshaler interface.
  // TODO: Can throw an error
  // TODO: Implement
  marshalJSON(): Buffer {
    return Buffer.from('');
  }

  // UnmarshalJSON unmarshals the passed JSON into a SignedState, implementing the Unmarshaler interface.
  // TODO: Can throw an error
  // TODO: Implement
  unmarshalJSON(j: Buffer): void {}

  // ChannelId returns the channel id of the state.
  // TODO: Implement
  channelId(): string {
    return '';
  }

  // SortInfo returns the channel id and turn number of the state, so the state can be easily sorted.
  // TODO: unit64 replacement
  // TODO: Implement
  sortInfo(): [string, number] {
    return ['', 0];
  }
}

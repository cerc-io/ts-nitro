import { Signature } from '../../crypto/signatures';
import { State } from './state';

export class SignedState {
  private _state?: State;

  // TODO: uint replacement
  private sigs?: Map<number, Signature>; // keyed by participant index

  constructor(params: {
    state: State,
    sigs?: Map<number, Signature>
  }) {
    Object.assign(this, params);
  }

  // newSignedState initializes a SignedState struct for the given
  // The signedState returned will have no signatures.
  static newSignedState(s: State): SignedState {
    return new SignedState({
      state: s,
      sigs: new Map(),
    });
  }

  // AddSignature adds a participant's signature to the SignedState.
  //
  // An error is returned if
  //   - the signer is not a participant, or
  //   - OR the signature was already stored
  // TODO: Can throw an error
  // TODO: Implement
  addSignature(sig: Signature): void {}

  // State returns the State part of the SignedState.
  // TODO: Implement
  state(): State | undefined {
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
  // TODO: Implement
  hasAllSignatures(): boolean {
    return false;
  }

  // GetParticipantSignature returns the signature for the participant specified by participantIndex
  // TODO: Can throw an error
  // TODO: Implement
  getParticipantSignature(participantIndex: number): Signature {
    return false;
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

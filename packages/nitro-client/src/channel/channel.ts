import assert from 'assert';

import { Signature } from '../crypto/signatures';
import { Destination } from '../types/destination';
import { Address } from '../types/types';
import { Funds } from '../types/funds';
import { MaxTurnNum, PostFundTurnNum, PreFundTurnNum } from './constants';
import { Allocation } from './state/outcome/allocation';
import { SignedState } from './state/signedstate';
import { FixedPart, State, ConstructorOptions as FixedPartConstructorOptions } from './state/state';

interface ConstructorOptions extends FixedPartConstructorOptions {
  id?: Destination;
  myIndex?: number;
  onChainFunding?: Funds;
  fixedPart?: FixedPart;
  signedStateForTurnNum?: Map<number, SignedState>;
  latestSupportedStateTurnNum?: number;
}

// Channel contains states and metadata and exposes convenience methods.
export class Channel extends FixedPart {
  id: Destination = new Destination();

  // TODO: unit replacement
  myIndex: number = 0;

  onChainFunding: Funds = new Funds();

  fixedPart?: FixedPart;
  // Support []uint64 // TODO: this property will be important, and allow the Channel to store the necessary data to close out the channel on chain
  // It could be an array of turnNums, which can be used to slice into Channel.SignedStateForTurnNum

  // TODO: unit64 replacement
  signedStateForTurnNum: Map<number, SignedState> = new Map();
  // Longer term, we should have a more efficient and smart mechanism to store states https://github.com/statechannels/go-nitro/issues/106

  // largest uint64 value reserved for "no supported state"
  // TODO: unit64 replacement
  private latestSupportedStateTurnNum: number = 0;

  // TODO: Add interface for record value type
  static jsonEncodingMap: Record<string, any> = {
    id: { type: 'class', value: Destination },
    myIndex: { type: 'number' },
    onChainFunding: { type: 'class', value: Funds },
    fixedPart: { type: 'class', value: FixedPart },
    signedStateForTurnNum: { type: 'map', key: { type: 'number' }, value: { type: 'class', value: SignedState } },
    latestSupportedStateTurnNum: { type: 'number' },
  };

  constructor(params: ConstructorOptions) {
    super(params);
    Object.assign(this, params);
  }

  // new constructs a new Channel from the supplied state.
  static new(s: State, myIndex: number): Channel {
    const c = new Channel({});
    s.validate();

    c.id = s.channelId();

    c.myIndex = myIndex;
    c.onChainFunding = new Funds();
    c.fixedPart = s.fixedPart().clone();
    c.latestSupportedStateTurnNum = MaxTurnNum; // largest uint64 value reserved for "no supported state"
    // c.Support =  // TODO

    // Store prefund
    c.signedStateForTurnNum = new Map();
    c.signedStateForTurnNum.set(PreFundTurnNum, new SignedState({ state: s }));

    // Store postfund
    const post = s.clone();
    post.turnNum = PostFundTurnNum;
    c.signedStateForTurnNum.set(PostFundTurnNum, new SignedState({ state: post }));

    // Set on chain holdings to zero for each asset
    for (const asset in s.outcome.totalAllocated().value) {
      if (s.outcome.totalAllocated().value.has(asset)) {
        c.onChainFunding.value.set(asset, BigInt(0));
      }
    }

    return c;
  }

  // TODO: Refactor into an util method
  static fromJSON(data: string): Channel {
    const jsonValue = JSON.parse(data);
    const props: any = {};

    for (const fieldKey in this.jsonEncodingMap) {
      const fieldType = this.jsonEncodingMap[fieldKey];
      props[fieldKey] = this.decodeValue(fieldType, jsonValue[fieldKey]);
    }

    return new Channel(props);
  }

  static decodeValue(fieldType: any, fieldJsonValue: any): any {
    switch (fieldType.type) {
      case 'class': {
        return fieldType.value.fromJSON(fieldJsonValue);
      }

      case 'number': {
        return fieldJsonValue;
      }

      case 'map': {
        const jsonMapValue = fieldJsonValue;
        const mapFieldvalue = new Map();

        for (const mapKey in jsonMapValue) {
          mapFieldvalue.set(
            this.decodeValue(fieldType.key, mapKey),
            this.decodeValue(fieldType.value, jsonMapValue[mapKey]),
          );
        }

        return mapFieldvalue;
      }

      default:
        throw new Error(`Unknown field type ${fieldType.type}`);
    }
  }

  toJSON(): string {
    assert(this.signedStateForTurnNum);
    const jsonObj: any = { ...this };

    // TODO: Generalize using jsonEncodingMap
    jsonObj.signedStateForTurnNum = Object.fromEntries(this.signedStateForTurnNum);

    return JSON.stringify(jsonObj);
  }

  // MarshalJSON returns a JSON representation of the Channel
  // TODO: Can throw an error
  // TODO: Implement
  marshalJSON(): Buffer {
    return Buffer.from('');
  }

  // UnmarshalJSON populates the calling Channel with the
  // json-encoded data
  // TODO: Can throw an error
  // TODO: Implement
  unmarshalJSON(data: Buffer): void {
    try {
      // TODO: Implement json.Unmarshal
      const jsonCh = JSON.parse(data.toString());
      Object.assign(this, jsonCh);
    } catch (err) {
      throw new Error('error unmarshaling channel data');
    }
  }

  // MyDestination returns the client's destination
  // TODO: Implement
  MyDestination(): string {
    return '';
  }

  // Clone returns a pointer to a new, deep copy of the receiver, or a nil pointer if the receiver is nil.
  clone(): Channel {
    // TODO: Implement
    return {} as Channel;
  }

  // PreFundState() returns the pre fund setup state for the channel.
  // TODO: Implement
  preFundState(): State {
    return {} as State;
  }

  // SignedPreFundState returns the signed pre fund setup state for the channel.
  // TODO: Implement
  signedPreFundState(): State {
    return {} as State;
  }

  // PostFundState() returns the post fund setup state for the channel.
  postFundState(): State {
    assert(this.signedStateForTurnNum);
    return this.signedStateForTurnNum.get(PostFundTurnNum)!.state();
  }

  // SignedPostFundState() returns the SIGNED post fund setup state for the channel.
  // TODO: Implement
  signedPostFundState(): SignedState {
    return {} as SignedState;
  }

  // PreFundSignedByMe returns true if the calling client has signed the pre fund setup state, false otherwise.
  // TODO: Implement
  preFundSignedByMe(): boolean {
    return false;
  }

  // PostFundSignedByMe returns true if the calling client has signed the post fund setup state, false otherwise.
  // TODO: Implement
  postFundSignedByMe(): boolean {
    return false;
  }

  // PreFundComplete() returns true if I have a complete set of signatures on  the pre fund setup state, false otherwise.
  // TODO: Implement
  preFundComplete(): boolean {
    return false;
  }

  // PostFundComplete() returns true if I have a complete set of signatures on  the pre fund setup state, false otherwise.
  // TODO: Implement
  postFundComplete(): boolean {
    return false;
  }

  // FinalSignedByMe returns true if the calling client has signed a final state, false otherwise.
  // TODO: Implement
  finalSignedByMe(): boolean {
    return false;
  }

  // FinalCompleted returns true if I have a complete set of signatures on a final state, false otherwise.
  // TODO: Implement
  finalCompleted(): boolean {
    return false;
  }

  // HasSupportedState returns true if the channel has a supported state, false otherwise.
  // TODO: Implement
  hasSupportedState(): boolean {
    return false;
  }

  // LatestSupportedState returns the latest supported state. A state is supported if it is signed
  // by all participants.
  // TODO: Can throw an error
  latestSupportedState(): State {
    // TODO: Implement
    return {} as State;
  }

  // LatestSignedState fetches the state with the largest turn number signed by at least one participant.
  // TODO: Can throw an error
  latestSignedState(): SignedState {
    // TODO: Implement
    return {} as SignedState;
  }

  // Total() returns the total allocated of each asset allocated by the pre fund setup state of the Channel.
  // TODO: Implement
  total(): Funds {
    return new Funds();
  }

  // Affords returns true if, for each asset keying the input variables, the channel can afford the allocation given the funding.
  // The decision is made based on the latest supported state of the channel.
  //
  // Both arguments are maps keyed by the same asset
  // TODO: Implement
  affords(allocationMap: Map<Address, Allocation>, fundingMap: Funds): boolean {
    return false;
  }

  // AddStateWithSignature constructs a SignedState from the passed state and signature, and calls s.AddSignedState with it.
  // TODO: Implement
  addStateWithSignature(s: State, sig: Signature): boolean {
    return false;
  }

  // AddSignedState adds a signed state to the Channel, updating the LatestSupportedState and Support if appropriate.
  // Returns false and does not alter the channel if the state is "stale", belongs to a different channel, or is signed by a non participant.
  addSignedState(ss: SignedState): boolean {
    const s = ss.state();

    if (s.channelId() !== this.id) {
      // Channel mismatch
      return false;
    }

    if (this.latestSupportedStateTurnNum !== MaxTurnNum && s.turnNum < this.latestSupportedStateTurnNum) {
      // Stale state
      return false;
    }

    // Store the signatures. If we have no record yet, add one.

    const signedState = this.signedStateForTurnNum.get(s.turnNum);

    if (!signedState) {
      this.signedStateForTurnNum.set(s.turnNum, ss);
    } else {
      try {
        // TODO: Implement
        signedState.merge(ss);
      } catch (err) {
        return false;
      }
    }

    // Update latest supported state
    if (this.signedStateForTurnNum.get(s.turnNum)!.hasAllSignatures()) {
      this.latestSupportedStateTurnNum = s.turnNum;
    }

    // TODO: update support

    return true;
  }

  // SignAndAddPrefund signs and adds the prefund state for the channel, returning a state.SignedState suitable for sending to peers.
  // TODO: Can throw an error
  // TODO: Implement
  signAndAddPrefund(sk: Buffer): SignedState {
    return {} as SignedState;
  }

  // SignAndAddPrefund signs and adds the postfund state for the channel, returning a state.SignedState suitable for sending to peers.
  // TODO: Can throw an error
  // TODO: Implement
  signAndAddPostfund(sk: Buffer): SignedState {
    return {} as SignedState;
  }

  // SignAndAddState signs and adds the state to the channel, returning a state.SignedState suitable for sending to peers.
  // TODO: Can throw an error
  // TODO: Implement
  signAndAddState(s: State, sk: Buffer): SignedState {
    return {} as SignedState;
  }
}

import { Signature } from '../crypto/signatures';
import { Address, Funds } from '../types/types';
import { MaxTurnNum, PostFundTurnNum, PreFundTurnNum } from './constants';
import { Allocation } from './state/outcome/allocation';
import { SignedState } from './state/signedstate';
import { FixedPart, State } from './state/state';

// Channel contains states and metadata and exposes convenience methods.
export class Channel {
  id: string;

  // TODO: unit replacement
  myIndex: number;

  onChainFunding: Funds;

  fixedPart: FixedPart;
  // Support []uint64 // TODO: this property will be important, and allow the Channel to store the necessary data to close out the channel on chain
  // It could be an array of turnNums, which can be used to slice into Channel.SignedStateForTurnNum

  // TODO: unit64 replacement
  signedStateForTurnNum: Map<number, SignedState>;
  // Longer term, we should have a more efficient and smart mechanism to store states https://github.com/statechannels/go-nitro/issues/106

  // largest uint64 value reserved for "no supported state"
  // TODO: unit64 replacement
  private latestSupportedStateTurnNum: number;

  // TODO: unit replacement
  constructor(s: State, myIndex: number) {
    // TODO: Use try-catch
    s.validate();

    this.id = s.channelId();

    this.myIndex = myIndex;
    this.onChainFunding = new Map();
    this.fixedPart = s.fixedPart().clone();
    this.latestSupportedStateTurnNum = MaxTurnNum; // largest uint64 value reserved for "no supported state"
    // c.Support =  // TODO

    // Store prefund
    this.signedStateForTurnNum = new Map();
    this.signedStateForTurnNum.set(PreFundTurnNum, new SignedState(s));

    // Store postfund
    const post = s.clone();
    post.turnNum = PostFundTurnNum;
    this.signedStateForTurnNum.set(PostFundTurnNum, new SignedState(post));

    // TODO: Implement
    // Set on chain holdings to zero for each asset
    // for asset := range s.Outcome.TotalAllocated() {
    //   c.OnChainFunding[asset] = big.NewInt(0)
    // }
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
  UnmarshalJSON(data: Buffer): void {}

  // MyDestination returns the client's destination
  // TODO: Implement
  MyDestination(): string {
    return '';
  }

  // Clone returns a pointer to a new, deep copy of the receiver, or a nil pointer if the receiver is nil.
  // TODO: Implement
  clone(): Channel {
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
  // TODO: Implement
  postFundState(): State {
    return {} as State;
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
  // TODO: Implement
  latestSupportedState(): State {
    return {} as State;
  }

  // LatestSignedState fetches the state with the largest turn number signed by at least one participant.
  // TODO: Can throw an error
  // TODO: Implement
  latestSignedState(): SignedState {
    return {} as SignedState;
  }

  // Total() returns the total allocated of each asset allocated by the pre fund setup state of the Channel.
  // TODO: Implement
  total(): Funds {
    return new Map();
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
  // TODO: Implement
  addSignedState(ss: SignedState): boolean {
    return false;
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

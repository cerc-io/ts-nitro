import assert from 'assert';
import _ from 'lodash';
import { Buffer } from 'buffer';
import { ethers } from 'ethers';

import {
  fromJSON, toJSON, FieldDescription, Uint, Uint64, NitroSigner,
} from '@cerc-nitro/nitro-util';
import { Bytes32 } from '@statechannels/nitro-protocol';

import { Signature } from '../crypto/signatures';
import { Destination } from '../types/destination';
import { Address } from '../types/types';
import { Funds } from '../types/funds';
import { MaxTurnNum, PostFundTurnNum, PreFundTurnNum } from './constants';
import { Allocation } from './state/outcome/allocation';
import { SignedState } from './state/signedstate';
import { FixedPart, State, ConstructorOptions as FixedPartConstructorOptions } from './state/state';
import {
  AllocationUpdatedEvent, ChainEvent, ChallengeRegisteredEvent, ConcludedEvent, DepositedEvent,
} from '../node/engine/chainservice/chainservice';
import { Exit } from './state/outcome/exit';

interface ConstructorOptions extends FixedPartConstructorOptions {
  id?: Destination;
  myIndex?: Uint;
  onChain?: OnChainData;
  offChain?: OffChainData;
}

interface OnChainDataConstructorOptions {
  holdings?: Funds;
  outcome?: Exit;
  stateHash?: Bytes32
}

interface OffChainDataConstructorOptions {
  signedStateForTurnNum?: Map<Uint64, SignedState>;
  latestSupportedStateTurnNum?: Uint64;
}

interface ChainUpdateData {
  blockNum: Uint64;
  txIndex: Uint;
}

class OnChainData {
  holdings: Funds = new Funds();

  outcome: Exit = new Exit();

  stateHash: Bytes32 = ethers.utils.hexZeroPad([], 32);

  constructor(params: OnChainDataConstructorOptions) {
    Object.assign(this, params);
  }

  static jsonEncodingMap: Record<string, FieldDescription> = {
    holdings: { type: 'class', value: Funds },
    outcome: { type: 'class', value: Exit },
    stateHash: { type: 'string' },
  };

  static fromJSON(data: string): OnChainData {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new OnChainData(props);
  }

  toJSON(): any {
    return toJSON(OnChainData.jsonEncodingMap, this);
  }
}

class OffChainData {
  signedStateForTurnNum: Map<Uint64, SignedState> = new Map();
  // Longer term, we should have a more efficient and smart mechanism to store states https://github.com/statechannels/go-nitro/issues/106

  // largest uint64 value reserved for "no supported state"
  // Can't make it private as access required when constructing VirtualChannel from an existing Channel instance
  latestSupportedStateTurnNum: Uint64 = BigInt(0);

  constructor(params: OffChainDataConstructorOptions) {
    Object.assign(this, params);
  }

  static jsonEncodingMap: Record<string, FieldDescription> = {
    signedStateForTurnNum: { type: 'map', key: { type: 'uint64' }, value: { type: 'class', value: SignedState } },
    latestSupportedStateTurnNum: { type: 'uint64' },
  };

  static fromJSON(data: string): OffChainData {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new OffChainData(props);
  }

  toJSON(): any {
    return toJSON(OffChainData.jsonEncodingMap, this);
  }
}

// Channel contains states and metadata and exposes convenience methods.
export class Channel extends FixedPart {
  id: Destination = new Destination();

  myIndex: Uint = BigInt(0);

  onChain: OnChainData = new OnChainData({});

  offChain: OffChainData = new OffChainData({});

  lastChainUpdate: ChainUpdateData = { blockNum: BigInt(0), txIndex: BigInt(0) };

  static jsonEncodingMap: Record<string, FieldDescription> = {
    id: { type: 'class', value: Destination },
    myIndex: { type: 'uint' },
    onChain: { type: 'class', value: OnChainData },
    offChain: { type: 'class', value: OffChainData },
    ...FixedPart.jsonEncodingMap,
  };

  static fromJSON(data: string): Channel {
    let props;

    try {
      props = fromJSON(this.jsonEncodingMap, data);
    } catch (err) {
      throw new Error(`error unmarshaling channel data: ${err}`);
    }

    return new Channel(props);
  }

  toJSON(): any {
    return toJSON(Channel.jsonEncodingMap, this);
  }

  constructor(params: ConstructorOptions) {
    super(params);
    Object.assign(this, params);
  }

  // isNewChainEvent returns true if the event has a greater block number (or equal blocknumber but with greater tx index)
  // than prior chain events process by the receiver.
  isNewChainEvent(event: ChainEvent): boolean {
    assert(this.lastChainUpdate);
    return event.blockNum() > this.lastChainUpdate.blockNum
      || (event.blockNum() === this.lastChainUpdate.blockNum && event.txIndex() > this.lastChainUpdate.txIndex);
  }

  // new constructs a new Channel from the supplied state.
  static new(s: State, myIndex: Uint): Channel {
    const c = new Channel({});
    s.validate();

    c.id = s.channelId();

    c.myIndex = myIndex;
    c.onChain.holdings = new Funds();
    Object.assign(c, s.fixedPart().clone());
    c.offChain.latestSupportedStateTurnNum = MaxTurnNum; // largest uint64 value reserved for "no supported state"

    // Store prefund
    c.offChain.signedStateForTurnNum = new Map();
    c.offChain.signedStateForTurnNum.set(PreFundTurnNum, SignedState.newSignedState(s));

    // Store postfund
    const post = s.clone();
    post.turnNum = PostFundTurnNum;
    c.offChain.signedStateForTurnNum.set(PostFundTurnNum, SignedState.newSignedState(post));

    // Set on chain holdings to zero for each asset
    for (const [asset] of s.outcome.totalAllocated().value) {
      c.onChain.holdings.value.set(asset, BigInt(0));
    }

    return c;
  }

  // MarshalJSON returns a JSON representation of the Channel
  marshalJSON(): Buffer {
    // Use toJSON method
    return Buffer.from('');
  }

  // UnmarshalJSON populates the calling Channel with the
  // json-encoded data
  unmarshalJSON(): void {
    // Use Channel.fromJSON()
  }

  // MyDestination returns the client's destination
  myDestination(): Destination {
    return Destination.addressToDestination(this.participants![Number(this.myIndex)]);
  }

  // Clone returns a pointer to a new, deep copy of the receiver, or a nil pointer if the receiver is nil.
  clone(): Channel {
    const d = Channel.new(this.preFundState().clone(), this.myIndex);
    d.offChain.latestSupportedStateTurnNum = this.offChain.latestSupportedStateTurnNum;

    this.offChain.signedStateForTurnNum.forEach((value, key) => {
      d.offChain.signedStateForTurnNum.set(key, value);
    });
    d.onChain.holdings = this.onChain.holdings.clone();
    Object.assign(d, super.clone());

    return d;
  }

  // PreFundState() returns the pre fund setup state for the channel.
  preFundState(): State {
    return this.offChain.signedStateForTurnNum.get(PreFundTurnNum)!.state();
  }

  // SignedPreFundState returns the signed pre fund setup state for the channel.
  signedPreFundState(): SignedState {
    return this.offChain.signedStateForTurnNum.get(PreFundTurnNum)!;
  }

  // PostFundState() returns the post fund setup state for the channel.
  postFundState(): State {
    assert(this.offChain.signedStateForTurnNum);
    return this.offChain.signedStateForTurnNum.get(PostFundTurnNum)!.state();
  }

  // SignedPostFundState() returns the SIGNED post fund setup state for the channel.
  signedPostFundState(): SignedState {
    return this.offChain.signedStateForTurnNum.get(PostFundTurnNum)!;
  }

  // PreFundSignedByMe returns true if the calling client has signed the pre fund setup state, false otherwise.
  preFundSignedByMe(): boolean {
    if (this.offChain.signedStateForTurnNum.has(PreFundTurnNum)) {
      if (this.offChain.signedStateForTurnNum.get(PreFundTurnNum)!.hasSignatureForParticipant(this.myIndex)) {
        return true;
      }
    }
    return false;
  }

  // PostFundSignedByMe returns true if the calling client has signed the post fund setup state, false otherwise.
  postFundSignedByMe(): boolean {
    if (this.offChain.signedStateForTurnNum.has(PostFundTurnNum)) {
      if (this.offChain.signedStateForTurnNum.get(PostFundTurnNum)!.hasSignatureForParticipant(this.myIndex)) {
        return true;
      }
    }
    return false;
  }

  // PreFundComplete() returns true if I have a complete set of signatures on  the pre fund setup state, false otherwise.
  preFundComplete(): boolean {
    return this.offChain.signedStateForTurnNum.get(PreFundTurnNum)!.hasAllSignatures();
  }

  // PostFundComplete() returns true if I have a complete set of signatures on  the pre fund setup state, false otherwise.
  postFundComplete(): boolean {
    return this.offChain.signedStateForTurnNum.get(PostFundTurnNum)!.hasAllSignatures();
  }

  // FinalSignedByMe returns true if the calling client has signed a final state, false otherwise.
  finalSignedByMe(): boolean {
    for (const [, ss] of this.offChain.signedStateForTurnNum) {
      if (ss.hasSignatureForParticipant(this.myIndex) && ss.state().isFinal) {
        return true;
      }
    }

    return false;
  }

  // FinalCompleted returns true if I have a complete set of signatures on a final state, false otherwise.
  finalCompleted(): boolean {
    if (this.offChain.latestSupportedStateTurnNum === MaxTurnNum) {
      return false;
    }

    return this.offChain.signedStateForTurnNum.get(this.offChain.latestSupportedStateTurnNum)!.state().isFinal;
  }

  // HasSupportedState returns true if the channel has a supported state, false otherwise.
  hasSupportedState(): boolean {
    return this.offChain.latestSupportedStateTurnNum !== MaxTurnNum;
  }

  // LatestSupportedState returns the latest supported state. A state is supported if it is signed
  // by all participants.
  latestSupportedState(): State {
    if (this.offChain.latestSupportedStateTurnNum === MaxTurnNum) {
      throw new Error('no state is yet supported');
    }

    return this.offChain.signedStateForTurnNum.get(this.offChain.latestSupportedStateTurnNum)!.state();
  }

  // LatestSignedState fetches the state with the largest turn number signed by at least one participant.
  latestSignedState(): SignedState {
    if (this.offChain.signedStateForTurnNum.size === 0) {
      throw new Error('no states are signed');
    }
    let latestTurn: Uint64 = BigInt(0);
    for (const [k] of this.offChain.signedStateForTurnNum) {
      if (k > latestTurn) {
        latestTurn = k;
      }
    }
    return this.offChain.signedStateForTurnNum.get(latestTurn)!;
  }

  // Total() returns the total allocated of each asset allocated by the pre fund setup state of the Channel.
  total(): Funds {
    return this.preFundState().outcome.totalAllocated();
  }

  // Affords returns true if, for each asset keying the input variables, the channel can afford the allocation given the funding.
  // The decision is made based on the latest supported state of the channel.
  //
  // Both arguments are maps keyed by the same asset
  affords(allocationMap: Map<Address, Allocation>, fundingMap: Funds): boolean {
    try {
      const lss = this.latestSupportedState();
      return lss.outcome.affords(allocationMap, fundingMap);
    } catch (err) {
      return false;
    }
  }

  // AddStateWithSignature constructs a SignedState from the passed state and signature, and calls s.AddSignedState with it.
  addStateWithSignature(s: State, sig: Signature): boolean {
    const ss = SignedState.newSignedState(s);
    try {
      ss.addSignature(sig);
    } catch (err) {
      return false;
    }
    return this.addSignedState(ss);
  }

  // AddSignedState adds a signed state to the Channel, updating the LatestSupportedState and Support if appropriate.
  // Returns false and does not alter the channel if the state is "stale", belongs to a different channel, or is signed by a non participant.
  addSignedState(ss: SignedState): boolean {
    const s = ss.state();

    if (!_.isEqual(s.channelId(), this.id)) {
      // Channel mismatch
      return false;
    }

    if (this.offChain.latestSupportedStateTurnNum !== MaxTurnNum && s.turnNum < this.offChain.latestSupportedStateTurnNum) {
      // Stale state
      return false;
    }

    // Store the signatures. If we have no record yet, add one.

    const signedState = this.offChain.signedStateForTurnNum.get(s.turnNum);

    if (!signedState) {
      this.offChain.signedStateForTurnNum.set(s.turnNum, ss);
    } else {
      try {
        signedState.merge(ss);
      } catch (err) {
        return false;
      }
    }

    // Update latest supported state
    if (this.offChain.signedStateForTurnNum.get(s.turnNum)!.hasAllSignatures()) {
      this.offChain.latestSupportedStateTurnNum = s.turnNum;
    }

    return true;
  }

  // SignAndAddPrefund signs and adds the prefund state for the channel, returning a state.SignedState suitable for sending to peers.
  async signAndAddPrefund(signer: NitroSigner): Promise<SignedState> {
    return this.signAndAddState(this.preFundState(), signer);
  }

  // SignAndAddPrefund signs and adds the postfund state for the channel, returning a state.SignedState suitable for sending to peers.
  async signAndAddPostfund(signer: NitroSigner): Promise<SignedState> {
    return this.signAndAddState(this.postFundState(), signer);
  }

  // SignAndAddState signs and adds the state to the channel, returning a state.SignedState suitable for sending to peers.
  async signAndAddState(s: State, signer: NitroSigner): Promise<SignedState> {
    let sig: Signature;
    try {
      sig = await s.sign(signer);
    } catch (err) {
      throw new Error(`Could not sign prefund ${err}`);
    }

    const ss = SignedState.newSignedState(s);
    try {
      ss.addSignature(sig);
    } catch (err) {
      throw new Error(`could not add own signature ${err}`);
    }

    const ok = this.addSignedState(ss);
    if (!ok) {
      throw new Error('could not add signed state to channel');
    }

    return ss;
  }

  // UpdateWithChainEvent mutates the receiver with the supplied chain event, replacing the relevant data fields.
  updateWithChainEvent(event: ChainEvent): Channel {
    if (!this.isNewChainEvent(event)) {
      throw new Error("chain event older than channel's last update");
    }
    // Process event

    switch (event.constructor) {
      case AllocationUpdatedEvent: {
        const e = event as AllocationUpdatedEvent;
        this.onChain.holdings.value.set(e.assetAndAmount.assetAddress, e.assetAndAmount.assetAmount!);
        break; // TODO: update OnChain.StateHash and OnChain.Outcome
      }
      case DepositedEvent: {
        const e = event as DepositedEvent;
        this.onChain.holdings.value.set(e.asset, e.nowHeld!);
        break;
      }
      case ConcludedEvent: {
        break; // TODO: update OnChain.StateHash and OnChain.Outcome
      }
      case ChallengeRegisteredEvent: {
        const e = event as ChallengeRegisteredEvent;

        const h = e.stateHash(this);
        this.onChain.stateHash = h;
        this.onChain.outcome = e.outcome();

        const ss = e.SignedState(this);
        this.addSignedState(ss);
        break;
      }
      default: {
        throw new Error(`channel ${this} cannot handle event ${event}`);
      }
    }

    // Update Channel.LastChainUpdate
    this.lastChainUpdate.blockNum = event.blockNum();
    this.lastChainUpdate.txIndex = event.txIndex();
    return this;
  }
}

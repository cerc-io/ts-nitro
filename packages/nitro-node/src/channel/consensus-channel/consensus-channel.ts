/* eslint-disable @typescript-eslint/no-use-before-define */

import assert from 'assert';
import _ from 'lodash';
import { Buffer } from 'buffer';
import { ethers } from 'ethers';

import {
  FieldDescription, NitroSigner, Uint, Uint64, fromJSON, toJSON, WrappedError,
} from '@cerc-io/nitro-util';
import { Bytes32 } from '@statechannels/nitro-protocol';

import { Signature } from '../../crypto/signatures';
import { Address } from '../../types/types';
import { Funds } from '../../types/funds';
import { FixedPart, State } from '../state/state';
import { SignedState } from '../state/signedstate';
import { Destination } from '../../types/destination';
import { Allocation, AllocationType, Allocations } from '../state/outcome/allocation';
import { Exit, SingleAssetExit } from '../state/outcome/exit';
import { GuaranteeMetadata } from '../state/outcome/guarantee';

export const ErrIncorrectChannelID = new Error('proposal ID and channel ID do not match');
export const ErrIncorrectTurnNum = new Error('incorrect turn number');
export const ErrInvalidDeposit = new Error('unable to divert to guarantee: invalid deposit');
export const ErrInsufficientFunds = new Error('insufficient funds');
export const ErrDuplicateGuarantee = new Error('duplicate guarantee detected');
export const ErrGuaranteeNotFound = new Error('guarantee not found');
export const ErrInvalidAmount = new Error('left amount is greater than the guarantee amount');

// From channel/consensus_channel/follower_channel.go
export const ErrNotFollower = new Error('method may only be called by channel follower');
export const ErrNoProposals = new Error('no proposals in the queue');
export const ErrUnsupportedQueuedProposal = new Error('only Add proposal is supported for queued proposals');
export const ErrUnsupportedExpectedProposal = new Error('only Add proposal is supported for expected update');
export const ErrNonMatchingProposals = new Error('expected proposal does not match first proposal in the queue');
export const ErrInvalidProposalSignature = new Error('invalid signature for proposal');
export const ErrInvalidTurnNum = new Error('the proposal turn number is not the next turn number');

// From channel/consensus_channel/leader_channel.go
export const ErrNotLeader = new Error('method may only be called by the channel leader');
export const ErrProposalQueueExhausted = new Error('proposal queue exhausted');
export const ErrWrongSigner = new Error('proposal incorrectly signed');

export enum ProposalType {
  AddProposal = 'AddProposal',
  RemoveProposal = 'RemoveProposal',
}

type LedgerIndex = Uint;

export const Leader: LedgerIndex = BigInt(0);
export const Follower: LedgerIndex = BigInt(1);

// Balance is a convenient, ergonomic representation of a single-asset Allocation
// of type 0, ie. a simple allocation.
export class Balance {
  destination: Destination = new Destination();

  amount?: bigint = undefined;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    destination: { type: 'class', value: Destination },
    amount: { type: 'bigint' },
  };

  static fromJSON(data: string): Balance {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Balance(props);
  }

  toJSON(): any {
    return toJSON(Balance.jsonEncodingMap, this);
  }

  constructor(params: {
    destination?: Destination;
    amount?: bigint;
  }) {
    Object.assign(this, params);
  }

  // AsAllocation converts a Balance struct into the on-chain outcome.Allocation type.
  asAllocation(): Allocation {
    const amount = BigInt(this.amount!);
    return new Allocation({
      destination: this.destination,
      amount,
      allocationType: AllocationType.NormalAllocationType,
    });
  }

  // Equal returns true if the balances are deeply equal, false otherwise.
  equal(b2: Balance): boolean {
    return _.isEqual(this.destination, b2.destination) && this.amount === b2.amount;
  }

  // Clone returns a deep copy of the receiver.
  clone(): Balance {
    return new Balance({
      destination: _.cloneDeep(this.destination),
      amount: BigInt(this.amount!),
    });
  }
}

interface GuaranteeOptions {
  amount?: bigint;
  _target?: Destination;
  left?: Destination;
  right?: Destination;
}

// Guarantee is a convenient, ergonomic representation of a
// single-asset Allocation of type 1, ie. a guarantee.
export class Guarantee {
  amount?: bigint = undefined;

  _target: Destination = new Destination();

  left: Destination = new Destination();

  right: Destination = new Destination();

  static jsonEncodingMap: Record<string, FieldDescription> = {
    amount: { type: 'bigint' },
    target: { type: 'class', value: Destination },
    left: { type: 'class', value: Destination },
    right: { type: 'class', value: Destination },
  };

  static fromJSON(data: string): Guarantee {
    const props = fromJSON(this.jsonEncodingMap, data, new Map([['target', '_target']]));
    return new Guarantee(props);
  }

  // NewGuarantee constructs a new guarantee.
  static newGuarantee(amount: bigint | undefined, target: Destination, left: Destination, right: Destination): Guarantee {
    return new Guarantee({
      amount, _target: target, left, right,
    });
  }

  toJSON(): any {
    return toJSON(Guarantee.jsonEncodingMap, this, new Map([['_target', 'target']]));
  }

  constructor(params: GuaranteeOptions) {
    Object.assign(this, params);
  }

  // Clone returns a deep copy of the receiver.
  clone(): Guarantee {
    return new Guarantee({
      amount: BigInt(this.amount!),
      _target: _.cloneDeep(this._target),
      left: _.cloneDeep(this.left),
      right: _.cloneDeep(this.right),
    });
  }

  // Target returns the target of the guarantee.
  target(): Destination {
    return this._target;
  }

  equal(g2: Guarantee): boolean {
    if (this.amount !== g2.amount) {
      return false;
    }

    return _.isEqual(this._target, g2._target)
    && _.isEqual(this.left, g2.left)
    && _.isEqual(this.right, g2.right);
  }

  // AsAllocation converts a Balance struct into the on-chain outcome.Allocation type
  asAllocation(): Allocation {
    const amount = BigInt(this.amount!);

    return new Allocation({
      destination: this._target,
      amount,
      allocationType: 1,
      metadata: Buffer.concat([this.left.bytes(), this.right.bytes()]),
    });
  }
}

// LedgerOutcome encodes the outcome of a ledger channel involving a "leader" and "follower"
// participant.
//
// This struct does not store items in sorted order. The conventional ordering of allocation items is:
// [leader, follower, ...guaranteesSortedByTargetDestination]
export class LedgerOutcome {
  // Address of the asset type
  private assetAddress: Address = ethers.constants.AddressZero;

  // Balance of participants[0]
  _leader: Balance = new Balance({});

  // Balance of participants[1]
  _follower: Balance = new Balance({});

  guarantees: Map<Bytes32, Guarantee> = new Map();

  static jsonEncodingMap: Record<string, FieldDescription> = {
    assetAddress: { type: 'address' },
    leader: { type: 'class', value: Balance },
    follower: { type: 'class', value: Balance },
    guarantees: { type: 'map', key: { type: 'string' }, value: { type: 'class', value: Guarantee } },
  };

  static fromJSON(data: string): LedgerOutcome {
    const props = fromJSON(
      this.jsonEncodingMap,
      data,
      new Map([
        ['leader', '_leader'],
        ['follower', '_follower'],
      ]),
    );
    return new LedgerOutcome(props);
  }

  toJSON(): any {
    return toJSON(
      LedgerOutcome.jsonEncodingMap,
      this,
      new Map([
        ['_leader', 'leader'],
        ['_follower', 'follower'],
      ]),
    );
  }

  constructor(params: {
    assetAddress?: Address;
    _leader?: Balance;
    _follower?: Balance
    guarantees?: Map<Bytes32, Guarantee>;
  }) {
    Object.assign(this, params);
  }

  // Leader returns the leader's balance.
  leader(): Balance {
    return this._leader;
  }

  // Follower returns the follower's balance.
  follower(): Balance {
    return this._follower;
  }

  // NewLedgerOutcome creates a new ledger outcome with the given asset address, balances, and guarantees.
  static newLedgerOutcome(assetAddress: Address, leader: Balance, follower: Balance, guarantees: Guarantee[]): LedgerOutcome {
    const guaranteeMap: Map<Bytes32, Guarantee> = new Map<Bytes32, Guarantee>();

    for (const g of guarantees) {
      guaranteeMap.set(g._target.value, g);
    }

    return new LedgerOutcome({
      assetAddress,
      _leader: leader,
      _follower: follower,
      guarantees: guaranteeMap,
    });
  }

  // FromExit creates a new LedgerOutcome from the given SingleAssetExit.
  //
  // It makes the following assumptions about the exit:
  //   - The first allocation entry is for the ledger leader
  //   - The second allocation entry is for the ledger follower
  //   - All other allocations are guarantees
  static fromExit(sae: SingleAssetExit): LedgerOutcome {
    const leader = new Balance({ destination: sae.allocations.value![0].destination, amount: sae.allocations.value![0].amount });
    const follower = new Balance({ destination: sae.allocations.value![1].destination, amount: sae.allocations.value![1].amount });
    const guarantees: Map<Bytes32, Guarantee> = new Map();

    for (const allocation of (sae.allocations.value ?? [])) {
      if (allocation.allocationType === AllocationType.GuaranteeAllocationType) {
        const gM = GuaranteeMetadata.decodeIntoGuaranteeMetadata(allocation.metadata);
        const guarantee: Guarantee = new Guarantee({
          amount: allocation.amount,
          _target: allocation.destination,
          left: gM.left,
          right: gM.right,
        });

        guarantees.set(allocation.destination.value, guarantee);
      }
    }

    return new LedgerOutcome({
      _leader: leader,
      _follower: follower,
      guarantees,
      assetAddress: sae.asset,
    });
  }

  asOutcome(): Exit {
    assert(this._leader);
    assert(this._follower);
    assert(this.guarantees);
    // The first items are [leader, follower] balances
    const allocations = [
      this._leader.asAllocation(),
      this._follower.asAllocation(),
    ];

    // Followed by guarantees, sorted by the target destination
    const keys = Array.from(this.guarantees.keys()).sort((a, b) => (a < b ? -1 : 1));
    for (const target of keys) {
      allocations.push(this.guarantees.get(target)!.asAllocation());
    }

    return new Exit(
      [new SingleAssetExit({
        asset: this.assetAddress,
        allocations: new Allocations(allocations),
      })],
    );
  }

  // clone returns a deep clone of v.
  _clone(): LedgerOutcome {
    const { assetAddress } = this;

    const leader = new Balance({
      destination: _.cloneDeep(this._leader.destination),
      amount: BigInt(this._leader.amount!), // Create a new BigInt instance
    });

    const follower = new Balance({
      destination: _.cloneDeep(this._follower.destination),
      amount: BigInt(this._follower.amount!), // Create a new BigInt instance
    });

    const guarantees = new Map<Bytes32, Guarantee>();
    for (const [d, g] of this.guarantees.entries()) {
      const g2 = g;
      g2.amount = BigInt(g.amount!);
      guarantees.set(d, g2);
    }

    return new LedgerOutcome({
      assetAddress,
      _leader: leader,
      _follower: follower,
      guarantees,
    });
  }

  // Clone returns a deep copy of the receiver.
  clone(): LedgerOutcome {
    const clonedGuarantees: Map<Bytes32, Guarantee> = new Map<Bytes32, Guarantee>();

    for (const [key, g] of this.guarantees) {
      clonedGuarantees.set(key, g.clone());
    }

    return new LedgerOutcome({
      assetAddress: this.assetAddress,
      _leader: this._leader.clone(),
      _follower: this._follower.clone(),
      guarantees: clonedGuarantees,
    });
  }

  // FundingTargets returns a list of channels funded by the LedgerOutcome
  fundingTargets(): Destination[] {
    const targets: Destination[] = [];

    for (const [dest] of this.guarantees) {
      targets.push(new Destination(dest));
    }

    return targets;
  }

  // Includes returns true when the receiver includes g in its list of guarantees.
  includes(g: Guarantee): boolean {
    const existing = this.guarantees.get(g._target.value);
    if (!existing) {
      return false;
    }

    return _.isEqual(g.left, existing.left)
      && _.isEqual(g.right, existing.right)
      && _.isEqual(g._target, existing._target)
      && g.amount === existing.amount;
  }

  // IncludesTarget returns true when the receiver includes a guarantee that targets the given destination.
  includesTarget(target: Destination): boolean {
    return this.guarantees.has(target.value);
  }
}

interface VarsConstructorOptions {
  turnNum?: Uint64;
  outcome?: LedgerOutcome;
}

// Vars stores the turn number and outcome for a state in a consensus channel.
export class Vars {
  turnNum: Uint64 = BigInt(0);

  outcome: LedgerOutcome = new LedgerOutcome({});

  static jsonEncodingMap: Record<string, FieldDescription> = {
    turnNum: { type: 'uint64' },
    outcome: { type: 'class', value: LedgerOutcome },
  };

  static fromJSON(data: string): Vars {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Vars(props);
  }

  toJSON(): any {
    return toJSON(Vars.jsonEncodingMap, this);
  }

  constructor(params: VarsConstructorOptions) {
    Object.assign(this, params);
  }

  asState(fp: FixedPart): State {
    assert(this.outcome);
    const outcome = this.outcome.asOutcome();

    return new State({
      // Variable
      turnNum: this.turnNum,
      outcome,

      // Constant
      participants: fp.participants,
      channelNonce: fp.channelNonce,
      challengeDuration: fp.challengeDuration,
      appData: Buffer.alloc(0),
      appDefinition: fp.appDefinition,
      isFinal: false,
    });
  }

  // Clone returns a deep copy of the receiver.
  clone() {
    return new Vars({ turnNum: this.turnNum, outcome: this.outcome._clone() });
  }

  // HandleProposal handles a proposal to add or remove a guarantee.
  // It will mutate Vars by calling Add or Remove for the proposal.
  handleProposal(p: Proposal): void {
    switch (p.type()) {
      case ProposalType.AddProposal:
        return this.add(p.toAdd);
      case ProposalType.RemoveProposal:
        return this.remove(p.toRemove);
      default:
        throw new Error('invalid proposal: a proposal must be either an add or a remove proposal');
    }
  }

  // Add mutates Vars by
  //   - increasing the turn number by 1
  //   - including the guarantee
  //   - adjusting balances accordingly
  //
  // An error is returned if:
  //   - the turn number is not incremented
  //   - the balances are incorrectly adjusted, or the deposits are too large
  //   - the guarantee is already included in vars.Outcome
  //
  // If an error is returned, the original vars is not mutated.
  add(p: Add): void {
    // CHECKS
    const o = this.outcome;

    if (o.guarantees.has(p._target.value)) {
      throw ErrDuplicateGuarantee;
    }

    let left: Balance;
    let right: Balance;

    if (_.isEqual(o._leader.destination, p.left)) {
      left = o._leader;
      right = o._follower;
    } else {
      left = o._follower;
      right = o._leader;
    }

    if (p.leftDeposit! > p.amount!) {
      throw ErrInvalidDeposit;
    }

    if (p.leftDeposit! > left.amount!) {
      throw ErrInsufficientFunds;
    }

    if (p.rightDeposit() > right.amount!) {
      throw ErrInsufficientFunds;
    }

    // EFFECTS

    // Increase the turn number
    this.turnNum += BigInt(1);

    const rightDeposit = p.rightDeposit();

    // Adjust balances
    if (_.isEqual(o._leader.destination, p.left)) {
      o._leader.amount = BigInt(o._leader.amount!) - BigInt(p.leftDeposit!);
      o._follower.amount = BigInt(o._follower.amount!) - rightDeposit;
    } else {
      o._follower.amount = BigInt(o._follower.amount!) - BigInt(p.leftDeposit!);
      o._leader.amount = BigInt(o._leader.amount!) - rightDeposit;
    }

    // Include guarantee
    o.guarantees.set(
      p._target.value,
      Guarantee.newGuarantee(p.amount, p._target, p.left, p.right),
    );
  }

  // Remove mutates Vars by
  //   - increasing the turn number by 1
  //   - removing the guarantee for the Target channel
  //   - adjusting balances accordingly based on LeftAmount and RightAmount
  //
  // An error is returned if:
  //   - the turn number is not incremented
  //   - a guarantee is not found for the target
  //   - the amounts are too large for the guarantee amount
  //
  // If an error is returned, the original vars is not mutated.
  remove(p: Remove): void {
    // CHECKS
    const o = this.outcome;

    const guarantee = o.guarantees.get(p.target.value);

    if (!guarantee) {
      throw ErrGuaranteeNotFound;
    }

    if (p.leftAmount! > guarantee.amount!) {
      throw ErrInvalidAmount;
    }

    // EFFECTS

    // Increase the turn number
    this.turnNum += BigInt(1);

    const rightAmount = BigInt(guarantee.amount!) - BigInt(p.leftAmount!);

    // Adjust balances

    if (_.isEqual(o._leader.destination, guarantee.left)) {
      o._leader.amount = BigInt(o._leader.amount!) + BigInt(p.leftAmount!);
      o._follower.amount = BigInt(o._follower.amount!) + rightAmount;
    } else {
      o._leader.amount = BigInt(o._leader.amount!) + rightAmount;
      o._follower.amount = BigInt(o._follower.amount!) + BigInt(p.leftAmount!);
    }

    // Remove the guarantee
    o.guarantees.delete(p.target.value);
  }
}

interface SignedVarsConstructorOptions extends VarsConstructorOptions {
  signatures?: [Signature, Signature];
}

// SignedVars stores 0-2 signatures for some vars in a consensus channel.
export class SignedVars extends Vars {
  signatures: [Signature, Signature] = [
    new Signature({}),
    new Signature({}),
  ];

  static jsonEncodingMap: Record<string, FieldDescription> = {
    ...super.jsonEncodingMap,
    signatures: { type: 'array', value: { type: 'class', value: Signature } },
  };

  static fromJSON(data: string): SignedVars {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new SignedVars(props);
  }

  toJSON(): any {
    return toJSON(SignedVars.jsonEncodingMap, this);
  }

  constructor(params: SignedVarsConstructorOptions) {
    super(params);
    Object.assign(this, params);
  }

  // clone returns a deep copy of the receiver.
  clone(): SignedVars {
    const clonedSignatures: [Signature, Signature] = [
      _.cloneDeep(this.signatures[0]),
      _.cloneDeep(this.signatures[1]),
    ];
    return new SignedVars({
      ...super.clone(),
      signatures: clonedSignatures,
    });
  }
}

interface AddOptions extends GuaranteeOptions {
  leftDeposit?: bigint;
}

// Add encodes a proposal to add a guarantee to a ConsensusChannel.
export class Add extends Guarantee {
  // LeftDeposit is the portion of the Add's amount that will be deducted from left participant's ledger balance.
  //
  // The right participant's deduction is computed as the difference between the guarantee amount and LeftDeposit.
  leftDeposit?: bigint = undefined;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    guarantee: { type: 'class', value: Guarantee },
    leftDeposit: { type: 'bigint' },
  };

  static fromJSON(data: string): Add {
    // props holds guarantee in a field
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Add({ ...props.guarantee, leftDeposit: props.leftDeposit });
  }

  toJSON(): any {
    // Use a custom object
    // (according to MarshalJSON implementation in go-nitro)
    const jsonAdd = {
      guarantee: Guarantee.newGuarantee(this.amount, this._target, this.left, this.right),
      leftDeposit: this.leftDeposit,
    };
    return toJSON(Add.jsonEncodingMap, jsonAdd);
  }

  constructor(params: AddOptions) {
    super(params);
    Object.assign(this, params);
  }

  // Clone returns a deep copy of the receiver.
  clone(): Add {
    if (this.leftDeposit === undefined) {
      return new Add({});
    }

    return new Add({
      ...super.clone(),
      leftDeposit: BigInt(this.leftDeposit!),
    });
  }

  // RightDeposit computes the deposit from the right participant such that
  // a.LeftDeposit + a.RightDeposit() fully funds a's guarantee.BalanceBalance
  rightDeposit(): bigint {
    const result = BigInt(this.amount!) - BigInt(this.leftDeposit!);
    return result;
  }

  equal(a2: Add): boolean {
    return _.isEqual((this as Guarantee), (a2 as Guarantee)) && this.leftDeposit === a2.leftDeposit;
  }

  // NewAdd constructs a new Add proposal.
  static newAdd(g: Guarantee, leftDeposit?: bigint): Add {
    return new Add({
      _target: g._target, amount: g.amount, left: g.left, right: g.right, leftDeposit,
    });
  }
}

// Remove is a proposal to remove a guarantee for the given virtual channel.
export class Remove {
  // Target is the address of the virtual channel being defunded
  target: Destination = new Destination();

  // LeftAmount is the amount to be credited (in the ledger channel) to the participant specified as the "left" in the guarantee.
  //
  // The amount for the "right" participant is calculated as the difference between the guarantee amount and LeftAmount.
  leftAmount?: bigint = undefined;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    target: { type: 'class', value: Destination },
    leftAmount: { type: 'bigint' },
  };

  static fromJSON(data: string): Remove {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Remove(props);
  }

  toJSON(): any {
    return toJSON(Remove.jsonEncodingMap, this);
  }

  constructor(params: {
    target?: Destination;
    leftAmount?: bigint;
  }) {
    Object.assign(this, params);
  }

  equal(r2: Remove): boolean {
    return _.isEqual(this.target, r2.target) && this.leftAmount === r2.leftAmount;
  }

  // Clone returns a deep copy of the receiver.
  clone(): Remove {
    if (this.leftAmount === undefined) {
      return new Remove({});
    }

    return new Remove({
      target: _.cloneDeep(this.target),
      leftAmount: BigInt(this.leftAmount!),
    });
  }

  // NewRemove constructs a new Remove proposal.
  static newRemove(target: Destination, leftAmount?: bigint): Remove {
    return new Remove({ target, leftAmount });
  }
}

// Proposal is a proposal either to add or to remove a guarantee.
//
// Exactly one of {toAdd, toRemove} should be non nil.
export class Proposal {
  // LedgerID is the ChannelID of the ConsensusChannel which should receive the proposal.
  //
  // The target virtual channel ID is contained in the Add / Remove struct.
  ledgerID: Destination = new Destination();

  toAdd: Add = new Add({});

  toRemove: Remove = new Remove({});

  static jsonEncodingMap: Record<string, FieldDescription> = {
    ledgerID: { type: 'class', value: Destination },
    toAdd: { type: 'class', value: Add },
    toRemove: { type: 'class', value: Remove },
  };

  static fromJSON(data: string): Proposal {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Proposal(props);
  }

  toJSON(): any {
    return toJSON(Proposal.jsonEncodingMap, this);
  }

  constructor(params: {
    ledgerID?: Destination;
    toAdd?: Add;
    toRemove?: Remove;
  }) {
    Object.assign(this, params);
  }

  // Target returns the target channel of the proposal.
  target(): Destination {
    switch (this.type()) {
      case 'AddProposal':
        return this.toAdd.target();
      case 'RemoveProposal':
        return this.toRemove.target;
      default:
        throw new Error(`invalid proposal type ${this.constructor.name}`);
    }
  }

  // Clone returns a deep copy of the receiver.
  clone(): Proposal {
    return new Proposal({
      ledgerID: _.cloneDeep(this.ledgerID),
      toAdd: this.toAdd.clone(),
      toRemove: this.toRemove.clone(),
    });
  }

  // Type returns the type of the proposal based on whether it contains an Add or a Remove proposal.
  type(): ProposalType {
    const zeroAdd = new Add({});
    if (!_.isEqual(this.toAdd, zeroAdd)) {
      return ProposalType.AddProposal;
    }
    return ProposalType.RemoveProposal;
  }

  // Equal returns true if the supplied Proposal is deeply equal to the receiver, false otherwise.
  equal(q: Proposal): boolean {
    return _.isEqual(this.ledgerID, q.ledgerID) && this.toAdd.equal(q.toAdd) && this.toRemove.equal(q.toRemove);
  }

  // NewAddProposal constructs a proposal with a valid Add proposal and empty remove proposal.
  static newAddProposal(ledgerID: Destination, g: Guarantee, leftDeposit?: bigint): Proposal {
    return new Proposal({ toAdd: Add.newAdd(g, leftDeposit), ledgerID });
  }

  // NewRemoveProposal constructs a proposal with a valid Remove proposal and empty Add proposal.
  static newRemoveProposal(ledgerID: Destination, target: Destination, leftAmount?: bigint): Proposal {
    return new Proposal({ toRemove: Remove.newRemove(target, leftAmount), ledgerID });
  }
}

type SignedProposalParams = {
  signature?: Signature;
  proposal?: Proposal;
  turnNum?: Uint64;
};

// SignedProposal is a Proposal with a signature on it.
export class SignedProposal {
  signature: Signature = new Signature({});

  proposal: Proposal = new Proposal({});

  turnNum: Uint64 = BigInt(0);

  static jsonEncodingMap: Record<string, FieldDescription> = {
    signature: { type: 'class', value: Signature },
    proposal: { type: 'class', value: Proposal },
    turnNum: { type: 'uint64' },
  };

  static fromJSON(data: string): SignedProposal {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new SignedProposal(props);
  }

  toJSON(): any {
    return toJSON(SignedProposal.jsonEncodingMap, this);
  }

  constructor(params: SignedProposalParams) {
    Object.assign(this, params);
  }

  // Clone returns a deep copy of the receiver.
  clone(): SignedProposal {
    return new SignedProposal({
      signature: _.cloneDeep(this.signature),
      proposal: this.proposal.clone(),
      turnNum: this.turnNum,
    });
  }

  // ChannelID returns the id of the ConsensusChannel which receive the proposal.
  channelID(): Destination {
    return this.proposal.ledgerID;
  }

  // SortInfo returns the channelId and turn number so the proposal can be easily sorted.
  sortInfo(): [Destination, Uint64] {
    const cId = this.proposal.ledgerID;
    const { turnNum } = this;
    return [cId, turnNum];
  }
}

// ConsensusChannel is used to manage states in a running ledger channel.
export class ConsensusChannel {
  // constants

  id: Destination = new Destination();

  myIndex: LedgerIndex = BigInt(0);

  onChainFunding: Funds = new Funds();

  private fp: FixedPart = new FixedPart({});

  // variables

  // current represents the "consensus state", signed by both parties
  private current: SignedVars = new SignedVars({});

  // a queue of proposed changes which can be applied to the current state, ordered by TurnNum.
  private _proposalQueue: SignedProposal[] | null = null;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    id: { type: 'class', value: Destination },
    onChainFunding: { type: 'class', value: Funds },
    myIndex: { type: 'uint' },
    fP: { type: 'class', value: FixedPart },
    current: { type: 'class', value: SignedVars },
    proposalQueue: { type: 'array', value: { type: 'class', value: SignedProposal } },
  };

  static fromJSON(data: string): ConsensusChannel {
    // props has fp as fP and _proposalQueue as proposalQueue
    const props = fromJSON(this.jsonEncodingMap, data);
    return new ConsensusChannel({
      id: props.id,
      myIndex: props.myIndex,
      onChainFunding: props.onChainFunding,
      fp: props.fP,
      current: props.current,
      _proposalQueue: props.proposalQueue,
    });
  }

  toJSON(): any {
    // Use a custom object
    // (according to MarshalJSON implementation in go-nitro)
    const jsonConsensusChannel = {
      myIndex: this.myIndex,
      fP: this.fp,
      id: this.id,
      onChainFunding: this.onChainFunding,
      current: this.current,
      proposalQueue: this._proposalQueue,
    };

    return toJSON(ConsensusChannel.jsonEncodingMap, jsonConsensusChannel);
  }

  constructor(params: {
    id?: Destination;
    myIndex?: LedgerIndex;
    onChainFunding?: Funds;
    fp?: FixedPart;
    current?: SignedVars;
    _proposalQueue?: SignedProposal[];
  }) {
    Object.assign(this, params);
  }

  // newConsensusChannel constructs a new consensus channel, validating its input by
  // checking that the signatures are as expected for the given fp, initialTurnNum and outcome.
  static newConsensusChannel(
    fp: FixedPart,
    myIndex: LedgerIndex,
    initialTurnNum: Uint64,
    outcome: LedgerOutcome,
    signatures: [Signature, Signature],
  ): ConsensusChannel {
    fp.validate();

    const cId = fp.channelId();

    const vars: Vars = new Vars({ turnNum: initialTurnNum, outcome: outcome._clone() });

    let leaderAddr; let
      followerAddr: string;

    try {
      leaderAddr = vars.asState(fp).recoverSigner(signatures[Number(Leader)]);

      if (leaderAddr !== fp.participants![Number(Leader)]) {
        throw new Error(`Leader did not sign initial state: ${leaderAddr}, ${fp.participants![Number(Leader)]}`);
      }

      followerAddr = vars.asState(fp).recoverSigner(signatures[Number(Follower)]);

      if (followerAddr !== fp.participants![Number(Follower)]) {
        throw new Error(`Follower did not sign initial state: ${followerAddr}, ${fp.participants![Number(Follower)]}`);
      }
    } catch (err) {
      throw new WrappedError('could not verify sig', err as Error);
    }

    const current = new SignedVars({
      ...vars,
      signatures,
    });

    return new ConsensusChannel({
      fp,
      id: cId,
      myIndex,
      onChainFunding: new Funds(),
      _proposalQueue: [],
      current,
    });
  }

  // NewLeaderChannel constructs a new LeaderChannel
  static newLeaderChannel(fp: FixedPart, turnNum: Uint64, outcome: LedgerOutcome, signatures: [Signature, Signature]): ConsensusChannel {
    return ConsensusChannel.newConsensusChannel(fp, Leader, turnNum, outcome, signatures);
  }

  // NewFollowerChannel constructs a new FollowerChannel
  static newFollowerChannel(fp: FixedPart, turnNum: Uint64, outcome: LedgerOutcome, signatures: [Signature, Signature]): ConsensusChannel {
    return ConsensusChannel.newConsensusChannel(fp, Follower, turnNum, outcome, signatures);
  }

  // FixedPart returns the fixed part of the channel.
  fixedPart(): FixedPart {
    return this.fp;
  }

  // Receive accepts a proposal signed by the ConsensusChannel counterparty,
  // validates its signature, and performs updates to the proposal queue and
  // consensus state.
  receive(sp: SignedProposal): void {
    if (this.isFollower()) {
      return this.followerReceive(sp);
    }
    if (this.isLeader()) {
      return this.leaderReceive(sp);
    }

    throw new Error('ConsensusChannel is malformed');
  }

  // IsProposed returns true if a proposal in the queue would lead to g being included in the receiver's outcome, and false otherwise.
  //
  // Specific clarification: If the current outcome already includes g, IsProposed returns false.
  isProposed(g: Guarantee): boolean {
    try {
      const latest = this.latestProposedVars();
      return latest.outcome.includes(g) && !this.includes(g);
    } catch (err) {
      return false;
    }
  }

  // IsProposedNext returns true if the next proposal in the queue would lead to g being included in the receiver's outcome, and false otherwise.
  isProposedNext(g: Guarantee): boolean {
    const vars = new Vars({ turnNum: this.current.turnNum, outcome: this.current.outcome._clone() });

    if (this._proposalQueue === null || this._proposalQueue.length === 0) {
      return false;
    }

    const p = this._proposalQueue[0];

    try {
      vars.handleProposal(p.proposal);
    } catch (err) {
      if (vars.turnNum !== p.turnNum) {
        throw new Error(`proposal turn number ${p.turnNum} does not match vars ${vars.turnNum}`);
      }

      throw err;
    }

    return vars.outcome.includes(g) && !this.includes(g);
  }

  // ConsensusTurnNum returns the turn number of the current consensus state.
  consensusTurnNum(): Uint64 {
    return this.current.turnNum;
  }

  // Includes returns whether or not the consensus state includes the given guarantee.
  includes(g: Guarantee): boolean {
    return this.current.outcome.includes(g);
  }

  // IncludesTarget returns whether or not the consensus state includes a guarantee
  // addressed to the given target.
  includesTarget(target: Destination): boolean {
    return this.current.outcome.includesTarget(target);
  }

  // HasRemovalBeenProposed returns whether or not a proposal exists to remove the guarantee for the target.
  hasRemovalBeenProposed(target: Destination): boolean {
    for (const p of this._proposalQueue ?? []) {
      if (p.proposal.type() === ProposalType.RemoveProposal) {
        const remove = p.proposal.toRemove;
        if (_.isEqual(remove.target, target)) {
          return true;
        }
      }
    }
    return false;
  }

  // HasRemovalBeenProposedNext returns whether or not the next proposal in the queue is a remove proposal for the given target
  hasRemovalBeenProposedNext(target: Destination): boolean {
    if (this._proposalQueue === null || this._proposalQueue.length === 0) {
      return false;
    }
    const p = this._proposalQueue[0];
    return p.proposal.type() === ProposalType.RemoveProposal && _.isEqual(p.proposal.toRemove.target, target);
  }

  // IsLeader returns true if the calling client is the leader of the channel,
  // and false otherwise.
  isLeader(): boolean {
    return this.myIndex === Leader;
  }

  // IsFollower returns true if the calling client is the follower of the channel,
  // and false otherwise.
  isFollower(): boolean {
    return this.myIndex === Follower;
  }

  // Leader returns the address of the participant responsible for proposing.
  leader(): Address {
    return this.fp.participants![Number(Leader)];
  }

  // Follower returns the address of the participant who receives and contersigns
  // proposals.
  follower(): Address {
    return this.fp.participants![Number(Follower)];
  }

  // FundingTargets returns a list of channels funded by the ConsensusChannel
  fundingTargets(): Destination[] {
    return this.current.outcome.fundingTargets();
  }

  // sign constructs a state.State from the given vars, using the ConsensusChannel's constant
  // values. It signs the resulting state using sk.
  private async sign(vars: Vars, signer: NitroSigner): Promise<Signature> {
    const signerAddress = await signer.getAddress();

    if (this.fp.participants![Number(this.myIndex)] !== signerAddress) {
      throw new Error(`attempting to sign from wrong address: ${signer}`);
    }

    const state = vars.asState(this.fp);
    return state.sign(signer);
  }

  // recoverSigner returns the signer of the vars using the given signature.
  private recoverSigner(vars: Vars, sig: Signature): Address {
    const state = vars.asState(this.fp);
    return state.recoverSigner(sig);
  }

  // ConsensusVars returns the vars of the consensus state
  // The consensus state is the latest state that has been signed by both parties.
  consensusVars(): Vars {
    return this.current;
  }

  // Signatures returns the signatures on the currently supported state.
  signatures(): [Signature, Signature] {
    return this.current.signatures;
  }

  // ProposalQueue returns the current queue of proposals, ordered by TurnNum.
  proposalQueue(): SignedProposal[] | null {
    // Since c.proposalQueue is already ordered by TurnNum, we can simply return it.
    return this._proposalQueue;
  }

  // latestProposedVars returns the latest proposed vars in a consensus channel
  // by cloning its current vars and applying each proposal in the queue.
  private latestProposedVars(): Vars {
    const vars = new Vars({ turnNum: this.current.turnNum, outcome: this.current.outcome._clone() });
    for (const p of this._proposalQueue ?? []) {
      vars.handleProposal(p.proposal);
    }

    return vars;
  }

  // validateProposalID checks that the given proposal's ID matches
  // the channel's ID.
  private validateProposalID(proposal: Proposal): void {
    if (!_.isEqual(proposal.ledgerID, this.id)) {
      throw ErrIncorrectChannelID;
    }
  }

  // Participants returns the channel participants.
  participants(): Address[] | null {
    return this.fp.participants;
  }

  // Clone returns a deep copy of the receiver.
  clone(): ConsensusChannel {
    const clonedProposalQueue: SignedProposal[] = new Array((this._proposalQueue ?? []).length);

    for (let i = 0; i < (this._proposalQueue ?? []).length; i += 1) {
      clonedProposalQueue[i] = this._proposalQueue![i].clone();
    }

    const d = new ConsensusChannel({
      myIndex: this.myIndex,
      fp: this.fp.clone(),
      id: _.cloneDeep(this.id),
      onChainFunding: this.onChainFunding.clone(),
      current: this.current.clone(),
      _proposalQueue: clonedProposalQueue,
    });
    return d;
  }

  // SupportedSignedState returns the latest supported signed state.
  supportedSignedState(): SignedState {
    const s = this.consensusVars().asState(this.fp);
    const sigs = this.current.signatures;
    const ss: SignedState = SignedState.newSignedState(s);
    ss.addSignature(sigs[0]);
    ss.addSignature(sigs[1]);

    return ss;
  }

  // UnmarshalJSON populates the receiver with the
  // json-encoded data
  unmarshalJSON() {
    // Use ConsensusChannel.fromJSON()
  }

  // From channel/consensus_channel/leader_channel.go

  // leaderReceive is called by the Leader and iterates through
  // the proposal queue until it finds the countersigned proposal.
  //
  // If this proposal was signed by the Follower:
  //   - the consensus state is updated with the supplied proposal
  //   - the proposal queue is trimmed
  //
  // If the countersupplied is stale (ie. proposal.TurnNum <= c.current.TurnNum) then
  // their proposal is ignored.
  //
  // An error is returned if:
  //   - the countersupplied proposal is not found
  //   - or if it is found but not correctly signed by the Follower
  private leaderReceive(countersigned: SignedProposal): void {
    if (this.myIndex !== Leader) {
      throw ErrNotLeader;
    }

    this.validateProposalID(countersigned.proposal);

    const consensusCandidate = new Vars({
      turnNum: this.current.turnNum,
      outcome: this.current.outcome._clone(),
    });
    const consensusTurnNum = countersigned.turnNum;

    if (consensusTurnNum <= consensusCandidate.turnNum) {
      // We've already seen this proposal; return early
      return;
    }

    for (let i = 0; i < (this._proposalQueue ?? []).length; i += 1) {
      const ourP = this._proposalQueue![i];

      consensusCandidate.handleProposal(ourP.proposal);

      if (consensusCandidate.turnNum === consensusTurnNum) {
        let signer: Address;
        try {
          signer = consensusCandidate.asState(this.fp).recoverSigner(countersigned.signature);
        } catch (err) {
          throw new WrappedError('unable to recover signer', err as Error);
        }

        if (signer !== this.fp.participants![Number(Follower)]) {
          throw ErrWrongSigner;
        }

        const mySig = ourP.signature;
        this.current = new SignedVars({
          outcome: consensusCandidate.outcome,
          turnNum: consensusCandidate.turnNum,
          signatures: [mySig, countersigned.signature],
        });
        this._proposalQueue = this._proposalQueue!.slice(i + 1);
        return;
      }
    }

    throw ErrProposalQueueExhausted;
  }

  // Propose is called by the Leader and receives a proposal to add or remove a guarantee,
  // and generates and stores a SignedProposal in the queue, returning the
  // resulting SignedProposal
  async propose(proposal: Proposal, signer: NitroSigner): Promise<SignedProposal> {
    if (this.myIndex !== Leader) {
      throw ErrNotLeader;
    }

    if (!_.isEqual(proposal.ledgerID, this.id)) {
      throw ErrIncorrectChannelID;
    }

    let vars: Vars;
    try {
      vars = this.latestProposedVars();
    } catch (err) {
      throw new WrappedError('unable to construct latest proposed vars', err as Error);
    }

    try {
      vars.handleProposal(proposal);
    } catch (err) {
      throw new WrappedError('propose could not add new state vars', err as Error);
    }

    let signature: Signature;
    try {
      signature = await this.sign(vars, signer);
    } catch (err) {
      throw new Error('unable to sign state update');
    }

    const signed = new SignedProposal({ proposal, signature, turnNum: vars.turnNum });

    try {
      this.appendToProposalQueue(signed);
    } catch (err) {
      throw new WrappedError('could not append to proposal queue', err as Error);
    }

    return signed;
  }

  // appendToProposalQueue safely appends the given SignedProposal to the proposal queue of the receiver.
  // It will return an error if the turn number of the SignedProposal is not consecutive with the existing queue.
  private appendToProposalQueue(signed: SignedProposal) {
    if (
      this._proposalQueue
      && this._proposalQueue.length > 0
      && this._proposalQueue[this._proposalQueue.length - 1].turnNum + BigInt(1) !== signed.turnNum
    ) {
      throw new Error('appending to ConsensusChannel.proposalQueue: not a consecutive TurnNum');
    }
    (this._proposalQueue ?? []).push(signed);
  }

  // From channel/consensus_channel/follower_channel.go

  // followerReceive is called by the follower to validate a proposal from the leader and add it to the proposal queue
  private followerReceive(p: SignedProposal): void {
    if (this.myIndex !== Follower) {
      throw ErrNotFollower;
    }

    this.validateProposalID(p.proposal);

    let vars: Vars;
    try {
      // Get the latest proposal vars we have
      vars = this.latestProposedVars();
    } catch (err) {
      throw new WrappedError('could not generate the current proposal', err as Error);
    }

    if (p.turnNum !== vars.turnNum + BigInt(1)) {
      throw ErrInvalidTurnNum;
    }

    // Add the incoming proposal to the vars
    try {
      vars.handleProposal(p.proposal);
    } catch (err) {
      throw new WrappedError('receive could not add new state vars', err as Error);
    }

    // Validate the signature
    let signer: Address;
    try {
      signer = this.recoverSigner(vars, p.signature);
    } catch (err) {
      throw new WrappedError('receive could not recover signature', err as Error);
    }

    if (signer !== this.leader()) {
      throw ErrInvalidProposalSignature;
    }

    // Update the proposal queue
    (this._proposalQueue ?? []).push(p);
  }

  // SignNextProposal is called by the follower and inspects whether the
  // expected proposal matches the first proposal in the queue. If so,
  // the proposal is removed from the queue and integrated into the channel state.
  async signNextProposal(expectedProposal: Proposal, signer: NitroSigner): Promise<SignedProposal> {
    if (this.myIndex !== Follower) {
      throw ErrNotFollower;
    }

    this.validateProposalID(expectedProposal);

    if (this._proposalQueue === null || this._proposalQueue.length === 0) {
      throw ErrNoProposals;
    }

    const p = this._proposalQueue[0].proposal;

    if (!p.equal(expectedProposal)) {
      throw ErrNonMatchingProposals;
    }

    // vars are cloned and modified instead of modified in place to simplify recovering from error
    const vars = new Vars({ turnNum: this.current.turnNum, outcome: this.current.outcome._clone() });

    vars.handleProposal(p);

    let signature: Signature;
    try {
      signature = await this.sign(vars, signer);
    } catch (err) {
      throw new Error(`unable to sign state update: ${err}`);
    }

    const signed = this._proposalQueue[0];

    this.current = new SignedVars({ turnNum: vars.turnNum, outcome: vars.outcome, signatures: [signed.signature, signature] });
    this._proposalQueue = this._proposalQueue.slice(1);

    return new SignedProposal({ signature, proposal: signed.proposal, turnNum: vars.turnNum });
  }
}

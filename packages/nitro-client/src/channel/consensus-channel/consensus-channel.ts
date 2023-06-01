import assert from 'assert';
import { ethers } from 'ethers';

import { Signature } from '../../crypto/signatures';
import { Address } from '../../types/types';
import { Funds } from '../../types/funds';
import { FixedPart, State } from '../state/state';
import { SignedState } from '../state/signedstate';
import { Destination } from '../../types/destination';
import { Allocation, AllocationType } from '../state/outcome/allocation';
import { Exit, SingleAssetExit } from '../state/outcome/exit';
import { GuaranteeMetadata } from '../state/outcome/guarantee';

type LedgerIndex = number;

export const Leader: LedgerIndex = 0;
export const Follower: LedgerIndex = 1;

// Balance is a convenient, ergonomic representation of a single-asset Allocation
// of type 0, ie. a simple allocation.
// TODO: Implement
export class Balance {
  destination: Destination = new Destination();

  amount: bigint = BigInt(0);

  constructor(params: {
    destination: Destination;
    amount: bigint;
  }) {
    Object.assign(this, params);
  }

  // AsAllocation converts a Balance struct into the on-chain outcome.Allocation type.
  asAllocation(): Allocation {
    const amount = BigInt(this.amount);
    return new Allocation({
      destination: this.destination,
      amount,
      allocationType: AllocationType.NormalAllocationType,
    });
  }
}

// Guarantee is a convenient, ergonomic representation of a
// single-asset Allocation of type 1, ie. a guarantee.
// TODO: Implement
export class Guarantee {
  amount: bigint = BigInt(0);

  private target: Destination = new Destination();

  private left: Destination = new Destination();

  private right: Destination = new Destination();

  constructor(params: {
    amount: bigint;
    target: Destination;
    left: Destination;
    right: Destination;
  }) {
    Object.assign(this, params);
  }

  // AsAllocation converts a Balance struct into the on-chain outcome.Allocation type
  asAllocation(): Allocation {
    const amount = BigInt(this.amount);

    return new Allocation({
      destination: this.target,
      amount,
      allocationType: AllocationType.NormalAllocationType,
      metadata: Buffer.concat([this.left.bytes(), this.right.bytes()]),
    });
  }
}

// LedgerOutcome encodes the outcome of a ledger channel involving a "leader" and "follower"
// participant.
//
// This struct does not store items in sorted order. The conventional ordering of allocation items is:
// [leader, follower, ...guaranteesSortedbyTargetDestination]
// TODO: Implement
export class LedgerOutcome {
  // Address of the asset type
  private assetAddress?: Address;

  // Balance of participants[0]
  private leader?: Balance;

  // Balance of participants[1]
  private follower?: Balance;

  private guarantees?: Map<Destination, Guarantee>;

  constructor(params: {
    assetAddress?: Address;
    leader?: Balance;
    follower?: Balance
    guarantees?: Map<Destination, Guarantee>;
  }) {
    Object.assign(this, params);
  }

  // FromExit creates a new LedgerOutcome from the given SingleAssetExit.
  //
  // It makes the following assumptions about the exit:
  //   - The first alloction entry is for the ledger leader
  //   - The second alloction entry is for the ledger follower
  //   - All other allocations are guarantees
  static fromExit(sae: SingleAssetExit): LedgerOutcome {
    const leader = new Balance({ destination: sae.allocations[0].destination, amount: sae.allocations[0].amount });
    const follower = new Balance({ destination: sae.allocations[1].destination, amount: sae.allocations[1].amount });
    const guarantees: Map<Destination, Guarantee> = new Map();

    for (const allocation of sae.allocations) {
      if (allocation.allocationType === AllocationType.GuaranteeAllocationType) {
        const gM = GuaranteeMetadata.decodeIntoGuaranteeMetadata(allocation.metadata);
        const guarantee: Guarantee = new Guarantee({
          amount: allocation.amount,
          target: allocation.destination,
          left: gM.left,
          right: gM.right,
        });

        guarantees.set(allocation.destination, guarantee);
      }
    }

    return new LedgerOutcome({
      leader,
      follower,
      guarantees,
      assetAddress: sae.asset,
    });
  }

  asOutcome(): Exit {
    assert(this.leader);
    assert(this.follower);
    assert(this.guarantees);
    // The first items are [leader, follower] balances
    const allocations = [
      this.leader.asAllocation(),
      this.follower.asAllocation(),
    ];

    // Followed by guarantees, sorted by the target destination
    const keys = Array.from(this.guarantees.keys()).sort((a, b) => a.string().localeCompare(b.string()));
    for (const target of keys) {
      allocations.push(this.guarantees.get(target)!.asAllocation());
    }

    return new Exit(
      [new SingleAssetExit({
        asset: this.assetAddress,
        allocations,
      })],
    );
  }

  clone(): LedgerOutcome {
    const { assetAddress } = this;

    const leader = new Balance({
      destination: this.leader!.destination,
      amount: BigInt(this.leader!.amount), // Create a new BigInt instance
    });

    const follower = new Balance({
      destination: this.follower!.destination,
      amount: BigInt(this.follower!.amount), // Create a new BigInt instance
    });

    const guarantees = new Map<Destination, Guarantee>();
    for (const [d, g] of this.guarantees!.entries()) {
      const g2 = g;
      g2.amount = BigInt(g.amount);
      guarantees.set(d, g2);
    }

    return new LedgerOutcome({
      assetAddress,
      leader,
      follower,
      guarantees,
    });
  }
}

// Vars stores the turn number and outcome for a state in a consensus channel.
// TODO: Implement
export class Vars {
  // TODO: uint64 replacement
  turnNum: number = 0;

  outcome?: LedgerOutcome;

  constructor(params: {
    turnNum?: number;
    outcome?: LedgerOutcome;
  }) {
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
}

// SignedVars stores 0-2 signatures for some vars in a consensus channel.
// TODO: Implement
export class SignedVars {
  vars?: Vars;

  signatures: [Signature, Signature] = [{}, {}];

  constructor(params: {
    vars?: Vars;
    signatures?: [Signature, Signature];
  }) {
    Object.assign(this, params);
  }
}

// ConsensusChannel is used to manage states in a running ledger channel.
export class ConsensusChannel {
  // constants

  id: Destination = new Destination();

  myIndex: LedgerIndex = 0;

  onChainFunding?: Funds;

  private fp?: FixedPart;

  // variables

  // current represents the "consensus state", signed by both parties
  private current?: SignedVars;

  // a queue of proposed changes which can be applied to the current state, ordered by TurnNum.
  private _proposalQueue: SignedProposal[] = [];

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
  // TODO: Can throw an error
  // TODO: Refactor to newConsensusChannel static method
  static newConsensusChannel(
    fp: FixedPart,
    myIndex: LedgerIndex,
    initialTurnNum: number,
    outcome: LedgerOutcome,
    signatures: [Signature, Signature],
  ): ConsensusChannel {
    const error = fp.validate();
    if (error) {
      throw error;
    }

    const cId = fp.channelId();

    const vars: Vars = new Vars({ turnNum: initialTurnNum, outcome: outcome.clone() });

    let leaderAddr; let
      followerAddr: string;

    try {
      leaderAddr = vars.asState(fp).recoverSigner(signatures[Leader]);

      if (leaderAddr !== fp.participants[Leader]) {
        throw new Error(`Leader did not sign initial state: ${leaderAddr}, ${fp.participants[Leader]}`);
      }

      followerAddr = vars.asState(fp).recoverSigner(signatures[Follower]);

      if (followerAddr !== fp.participants[Follower]) {
        throw new Error(`Follower did not sign initial state: ${followerAddr}, ${fp.participants[Follower]}`);
      }
    } catch (err) {
      throw new Error(`could not verify sig: ${err}`);
    }

    const current = new SignedVars({
      vars,
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
  // TODO: Refactor to leader-channel file
  static newLeaderChannel(fp: FixedPart, turnNum: number, outcome: LedgerOutcome, signatures: [Signature, Signature]): ConsensusChannel {
    return ConsensusChannel.newConsensusChannel(fp, Leader, turnNum, outcome, signatures);
  }

  // NewFollowerChannel constructs a new FollowerChannel
  // TODO: Refactor to follower-channel file
  static newFollowerChannel(fp: FixedPart, turnNum: number, outcome: LedgerOutcome, signatures: [Signature, Signature]): ConsensusChannel {
    return ConsensusChannel.newConsensusChannel(fp, Follower, turnNum, outcome, signatures);
  }

  // FixedPart returns the fixed part of the channel.
  // TODO: Implement
  fixedPart(): FixedPart {
    return this.fp!;
  }

  // Receive accepts a proposal signed by the ConsensusChannel counterparty,
  // validates its signature, and performs updates to the proposal queue and
  // consensus state.
  // TODO: Can throw an error
  // TODO: Implement
  receive(sp: SignedProposal): void {}

  // IsProposed returns true if a proposal in the queue would lead to g being included in the receiver's outcome, and false otherwise.
  //
  // Specific clarification: If the current outcome already includes g, IsProposed returns false.
  // TODO: Can throw an error
  // TODO: Implement
  isProposed(g: Guarantee): boolean {
    return false;
  }

  // IsProposedNext returns true if the next proposal in the queue would lead to g being included in the receiver's outcome, and false otherwise.
  // TODO: Can throw an error
  // TODO: Implement
  isProposedNext(g: Guarantee): boolean {
    return false;
  }

  // ConsensusTurnNum returns the turn number of the current consensus state.
  // TODO: uint64 replacement
  // TODO: Implement
  consensusTurnNum(): number {
    return 0;
  }

  // Includes returns whether or not the consensus state includes the given guarantee.
  // TODO: Implement
  includes(g: Guarantee): boolean {
    return false;
  }

  // IncludesTarget returns whether or not the consensus state includes a guarantee
  // addressed to the given target.
  // TODO: Implement
  includesTarget(target: string): boolean {
    return false;
  }

  // HasRemovalBeenProposed returns whether or not a proposal exists to remove the guaranatee for the target.
  // TODO: Implement
  hasRemovalBeenProposed(target: string): boolean {
    return false;
  }

  // HasRemovalBeenProposedNext returns whether or not the next proposal in the queue is a remove proposal for the given target
  // TODO: Implement
  hasRemovalBeenProposedNext(target: string): boolean {
    return false;
  }

  // IsLeader returns true if the calling client is the leader of the channel,
  // and false otherwise.
  // TODO: Implement
  isLeader(): boolean {
    return false;
  }

  // IsFollower returns true if the calling client is the follower of the channel,
  // and false otherwise.
  // TODO: Implement
  isFollower(): boolean {
    return false;
  }

  // Leader returns the address of the participant responsible for proposing.
  // TODO: Implement
  leader(): Address {
    return ethers.constants.AddressZero;
  }

  // Follower returns the address of the participant who receives and contersigns
  // proposals.
  // TODO: Implement
  follower(): Address {
    return ethers.constants.AddressZero;
  }

  // FundingTargets returns a list of channels funded by the ConsensusChannel
  // TODO: Implement
  fundingTargets(): string[] {
    return [];
  }

  // TODO: Can throw an error
  // TODO: Implement
  accept(p: SignedProposal): void {
    throw new Error('UNIMPLEMENTED');
  }

  // sign constructs a state.State from the given vars, using the ConsensusChannel's constant
  // values. It signs the resulting state using sk.
  // TODO: Can throw an error
  // TODO: Implement
  private sign(vars: Vars, sk: Buffer): Signature {
    return {};
  }

  // recoverSigner returns the signer of the vars using the given signature.
  // TODO: Can throw an error
  // TODO: Implement
  private recoverSigner(vars: Vars, sig: Signature): Address {
    return ethers.constants.AddressZero;
  }

  // ConsensusVars returns the vars of the consensus state
  // The consensus state is the latest state that has been signed by both parties.
  // TODO: Implement
  consensusVars(): Vars {
    return new Vars({});
  }

  // Signatures returns the signatures on the currently supported state.
  // TODO: Implement
  signatures(): [Signature, Signature] {
    return [{}, {}];
  }

  // ProposalQueue returns the current queue of proposals, ordered by TurnNum.
  // TODO: Implement
  proposalQueue(): SignedProposal[] {
    // Since c.proposalQueue is already ordered by TurnNum, we can simply return it.
    return this._proposalQueue!;
  }

  // latestProposedVars returns the latest proposed vars in a consensus channel
  // by cloning its current vars and applying each proposal in the queue.
  // TODO: Can throw an error
  // TODO: Implement
  private latestProposedVars(): Vars {
    return new Vars({});
  }

  // validateProposalID checks that the given proposal's ID matches
  // the channel's ID.
  // TODO: Can throw an error
  // TODO: Implement
  private validateProposalID(propsal: Proposal): void {}

  // Participants returns the channel participants.
  // TODO: Implement
  participants(): Address[] {
    return [];
  }

  // Clone returns a deep copy of the receiver.
  // TODO: Implement
  clone(): ConsensusChannel {
    return {} as ConsensusChannel;
  }

  // SupportedSignedState returns the latest supported signed state.
  // TODO: Implement
  supportedSignedState(): SignedState {
    return {} as SignedState;
  }
}

// Proposal is a proposal either to add or to remove a guarantee.
//
// Exactly one of {toAdd, toRemove} should be non nil.
// TODO: Implement
export class Proposal {
  // LedgerID is the ChannelID of the ConsensusChannel which should receive the proposal.
  //
  // The target virtual channel ID is contained in the Add / Remove struct.
  ledgerID?: string;

  toAdd?: Add;

  toRemove?: Remove;
}

// SignedProposal is a Proposal with a signature on it.
// TODO: Implement
export class SignedProposal {
  signature?: Signature;

  proposal?: Proposal;

  turnNum?: number;
}

// Add encodes a proposal to add a guarantee to a ConsensusChannel.
// TODO: Implement
export class Add {
  guarantee?: Guarantee;

  // LeftDeposit is the portion of the Add's amount that will be deducted from left participant's ledger balance.
  //
  // The right participant's deduction is computed as the difference between the guarantee amount and LeftDeposit.
  leftDeposit?: bigint;
}

// Remove is a proposal to remove a guarantee for the given virtual channel.
// TODO: Implement
export class Remove {
  // Target is the address of the virtual channel being defunded
  target?: string;

  // LeftAmount is the amount to be credited (in the ledger channel) to the participant specified as the "left" in the guarantee.
  //
  // The amount for the "right" participant is calculated as the difference between the guarantee amount and LeftAmount.
  leftAmount?: bigint;
}

import { Signature } from '../../crypto/signatures';
import { Address, Funds } from '../../types/types';
import { FixedPart } from '../state/state';

type LedgerIndex = number;

const Leader: LedgerIndex = 0;
const Follower: LedgerIndex = 1;

// ConsensusChannel is used to manage states in a running ledger channel.
// TODO: Implement
export class ConsensusChannel {
  // constants

  id?: String;

  myIndex?: LedgerIndex;

  onChainFunding?: Funds;

  private fp?: FixedPart;

  // variables

  // current represents the "consensus state", signed by both parties
  private current?: SignedVars;

  // a queue of proposed changes which can be applied to the current state, ordered by TurnNum.
  private proposalQueue?: SignedProposal[];
}

// Balance is a convenient, ergonomic representation of a single-asset Allocation
// of type 0, ie. a simple allocation.
// TODO: Implement
export class Balance {
  private destination?: string;

  private amount?: bigint;
}

// Guarantee is a convenient, ergonomic representation of a
// single-asset Allocation of type 1, ie. a guarantee.
// TODO: Implement
export class Guarantee {
  private amount?: bigint;

  private target?: string;

  private left?: string;

  private right?: string;
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

  private guarantees?: Map<string, Guarantee>;
}

// Vars stores the turn number and outcome for a state in a consensus channel.
// TODO: Implement
export class Vars {
  // TODO: uint64 replacement
  turnNum?: number;

  outcome?: LedgerOutcome;
}

// SignedVars stores 0-2 signatures for some vars in a consensus channel.
// TODO: Implement
export class SignedVars {
  vars?: Vars;

  signatures?: [Signature, Signature];
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

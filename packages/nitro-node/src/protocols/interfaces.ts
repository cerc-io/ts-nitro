import { NitroSigner } from '@cerc-io/nitro-util';
import { Message, ObjectiveId, ObjectivePayload } from './messages';
import { Proposal, SignedProposal } from '../channel/consensus-channel/consensus-channel';
import { Address } from '../types/types';
import { Destination } from '../types/destination';
import { Funds } from '../types/funds';
import { SignedState } from '../channel/state/signedstate';
import { Signature } from '../crypto/signatures';

export const errNotApproved = new Error('objective not approved');

// ChainTransaction defines the interface that every transaction must implement
export interface ChainTransaction {
  channelId: () => Destination
}

// ChainTransactionBase is a convenience struct that is embedded in other transaction structs.
// It is exported only to allow cmp.Diff to compare transactions
class ChainTransactionBase implements ChainTransaction {
  private _channelId: Destination;

  constructor(channelId: Destination) {
    this._channelId = channelId;
  }

  channelId(): Destination {
    return this._channelId;
  }
}

export class DepositTransaction extends ChainTransactionBase implements ChainTransaction {
  deposit: Funds = new Funds();

  constructor(params: {
    channelId: Destination
    deposit?: Funds
  }) {
    super(params.channelId);
    Object.assign(this, { deposit: params.deposit });
  }

  static newDepositTransaction(channelId: Destination, deposit: Funds): DepositTransaction {
    return new DepositTransaction({
      channelId,
      deposit,
    });
  }
}

export class WithdrawAllTransaction extends ChainTransactionBase implements ChainTransaction {
  signedState: SignedState = new SignedState({});

  constructor(params: {
    channelId: Destination
    signedState?: SignedState,
  }) {
    super(params.channelId);
    Object.assign(this, { signedState: params.signedState });
  }

  static newWithdrawAllTransaction(channelId: Destination, signedState: SignedState): WithdrawAllTransaction {
    return new WithdrawAllTransaction({ channelId, signedState });
  }
}

export class ChallengeTransaction extends ChainTransactionBase implements ChainTransaction {
  candidate: SignedState = new SignedState({});

  proof: SignedState[] = [];

  challengerSig: Signature = new Signature({});

  constructor(params: {
    channelId: Destination
    candidate: SignedState,
    proof: SignedState[],
    challengerSig: Signature
  }) {
    super(params.channelId);
    Object.assign(this, { candidate: params.candidate, proof: params.proof, challengerSig: params.challengerSig });
  }

  static newChallengeTransaction(
    channelId: Destination,
    candidate: SignedState,
    proof: SignedState[],
    challengerSig: Signature,
  ): ChallengeTransaction {
    return new ChallengeTransaction({
      channelId,
      candidate,
      proof,
      challengerSig,
    });
  }
}

// SideEffects are effects to be executed by an imperative shell
export class SideEffects {
  messagesToSend: Message[] = [];

  transactionsToSubmit: ChainTransaction[] = [];

  proposalsToProcess: Proposal[] = [];

  constructor(params: {
    messagesToSend?: Message[],
    transactionsToSubmit?: ChainTransaction[],
    proposalsToProcess?: Proposal[],
  }) {
    Object.assign(this, params);
  }

  // From protocols/messages.go
  // Merge accepts a SideEffects struct that is merged into the the existing SideEffects.
  merge(other: SideEffects) {
    this.messagesToSend.push(...other.messagesToSend);
    this.transactionsToSubmit.push(...other.transactionsToSubmit);
    this.proposalsToProcess.push(...other.proposalsToProcess);
  }
}

// WaitingFor is an enumerable "pause-point" computed from an Objective.
// It describes how the objective is blocked on actions by third parties (i.e. co-participants or the blockchain).
export type WaitingFor = string;

// Storable is an object that can be stored by the store.
export interface Storable {
  toJSON (): any
  // static fromJSON(data: string): any
}

// Objective is the interface for off-chain protocols.
// The lifecycle of an objective is as follows:
//   - It is initialized by a single client (passing in various parameters). It is implicitly approved by that client.
//     It is communicated to the other clients.
//   - It is stored and then approved or rejected by the other clients
//   - It is updated with external information arriving to the client
//   - After each update, it is cranked. This generates side effects and other metadata
//   - The metadata will eventually indicate that the Objective has stalled OR the Objective has completed successfully
export interface Objective extends Storable {
  id (): ObjectiveId

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  approve (): Objective

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  reject (): [Objective, SideEffects]

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  update (payload: ObjectivePayload): Objective

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  crank (signer: NitroSigner): Promise<[Objective, SideEffects, WaitingFor]>

  // Related returns a slice of related objects that need to be stored along with the objective
  related (): Storable[]

  // OwnsChannel returns the channel the objective exclusively owns.
  ownsChannel (): Destination

  // GetStatus returns the status of the objective.
  getStatus (): ObjectiveStatus
}

// ProposalReceiver is an Objective that receives proposals.
export interface ProposalReceiver extends Objective {
  // ReceiveProposal receives a signed proposal and returns an updated VirtualObjective.
  // It is used to update the objective with a proposal received from a peer.
  receiveProposal(signedProposal: SignedProposal): ProposalReceiver
}

export enum ObjectiveStatus {
  Unapproved = 0,
  Approved,
  Rejected,
  Completed,
}

// ObjectiveRequest is a request to create a new objective.
export interface ObjectiveRequest {
  id (address: Address, chainId?: bigint): ObjectiveId
  waitForObjectiveToStart (): void
  signalObjectiveStarted (): void
}

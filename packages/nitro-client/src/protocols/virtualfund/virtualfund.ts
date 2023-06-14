import assert from 'assert';
import { ethers } from 'ethers';

import Channel from '@nodeguy/channel';
import type { ReadWriteChannel } from '@nodeguy/channel';
import { FieldDescription, fromJSON, toJSON } from '@cerc-io/nitro-util';

import { Destination } from '../../types/destination';
import {
  ConsensusChannel, SignedProposal, Proposal, Guarantee,
} from '../../channel/consensus-channel/consensus-channel';
import { Exit } from '../../channel/state/outcome/exit';
import { FixedPart, State } from '../../channel/state/state';
import { Funds } from '../../types/funds';
import { Address } from '../../types/types';
import {
  ObjectiveRequest as ObjectiveRequestInterface,
  Objective as ObjectiveInterface,
  ObjectiveStatus,
  SideEffects,
  WaitingFor,
  Storable,
  ProposalReceiver,
} from '../interfaces';
import { ObjectiveId, ObjectivePayload } from '../messages';
import { VirtualChannel } from '../../channel/virtual';
import { GuaranteeMetadata } from '../../channel/state/outcome/guarantee';
import { SignedState } from '../../channel/state/signedstate';

export const ObjectivePrefix = 'VirtualFund-';

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
interface GetTwoPartyConsensusLedgerFunction {
  (counterparty: Address): [ConsensusChannel | undefined, boolean]
}

class GuaranteeInfo {
  public left: Destination = new Destination();

  public right: Destination = new Destination();

  // TODO: Make non-optional?
  public leftAmount?: Funds;

  public rightAmount?: Funds;

  public guaranteeDestination: Destination = new Destination();

  static jsonEncodingMap: Record<string, FieldDescription> = {
    left: { type: 'class', value: Destination },
    right: { type: 'class', value: Destination },
    leftAmount: { type: 'class', value: Funds },
    rightAmount: { type: 'class', value: Funds },
    guaranteeDestination: { type: 'class', value: Destination },
  };

  static fromJSON(data: string): GuaranteeInfo {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new GuaranteeInfo(props);
  }

  toJSON(): any {
    return toJSON(GuaranteeInfo.jsonEncodingMap, this);
  }

  constructor(params: {
    left?: Destination,
    right?: Destination,
    leftAmount?: Funds,
    rightAmount?: Funds,
    guaranteeDestination?: Destination
  }) {
    Object.assign(this, params);
  }
}

// TODO: Implement
export class Connection {
  channel?: ConsensusChannel;

  guaranteeInfo: GuaranteeInfo = new GuaranteeInfo({});

  static jsonEncodingMap: Record<string, FieldDescription> = {
    channel: { type: 'class', value: ConsensusChannel },
    guaranteeInfo: { type: 'class', value: GuaranteeInfo },
  };

  static fromJSON(data: string): Connection {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Connection(props);
  }

  toJSON(): any {
    return toJSON(Connection.jsonEncodingMap, this);
  }

  constructor(params: {
    channel?: ConsensusChannel,
    guaranteeInfo?: GuaranteeInfo,
  }) {
    Object.assign(this, params);
  }

  // insertGuaranteeInfo mutates the receiver Connection struct.
  insertGuaranteeInfo(a0: Funds, b0: Funds, vId: Destination, left: Destination, right: Destination) {
    const guaranteeInfo = new GuaranteeInfo({
      left,
      right,
      leftAmount: a0,
      rightAmount: b0,
      guaranteeDestination: vId,
    });

    const metadata = new GuaranteeMetadata({
      left: guaranteeInfo.left,
      right: guaranteeInfo.right,
    });

    metadata.encode();

    // The metadata can be encoded, so update the connection's guarantee
    this.guaranteeInfo = guaranteeInfo;
  }

  // handleProposal receives a signed proposal and acts according to the leader / follower
  // TODO: Implement
  handleProposal(sp: SignedProposal) { }

  // IsFundingTheTarget computes whether the ledger channel on the receiver funds the guarantee expected by this connection
  // TODO: Implement
  isFundingTheTarget(): boolean {
    return false;
  }

  // getExpectedGuarantee returns a map of asset addresses to guarantees for a Connection.
  // TODO: Implement
  getExpectedGuarantee(): Guarantee {
    return {} as Guarantee;
  }

  // TODO: Implement
  expectedProposal(): Proposal {
    return {} as Proposal;
  }
}

// Objective is a cache of data computed by reading from the store. It stores (potentially) infinite data.
export class Objective implements ObjectiveInterface, ProposalReceiver {
  status: ObjectiveStatus = ObjectiveStatus.Unapproved;

  v?: VirtualChannel;

  toMyLeft?: Connection;

  toMyRight?: Connection;

  private n: number = 0; // number of intermediaries

  myRole: number = 0; // index in the virtual funding protocol. 0 for Alice, n+1 for Bob. Otherwise, one of the intermediaries.

  private a0?: Funds; // Initial balance for Alice

  private b0?: Funds; // Initial balance for Bob

  static jsonEncodingMap: Record<string, FieldDescription> = {
    status: { type: 'number' },
    v: { type: 'class', value: VirtualChannel },
    toMyLeft: { type: 'class', value: Connection },
    toMyRight: { type: 'class', value: Connection },
    n: { type: 'number' },
    myRole: { type: 'number' },
    a0: { type: 'class', value: Funds },
    b0: { type: 'class', value: Funds },
  };

  static fromJSON(data: string): Objective {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Objective(props);
  }

  toJSON(): any {
    return toJSON(Objective.jsonEncodingMap, this);
  }

  constructor(params: {
    status?: ObjectiveStatus,
    v?: VirtualChannel,
    toMyLeft?: Connection,
    toMyRight?: Connection,
    n?: number,
    myRole?: number,
    a0?: Funds,
    b0?: Funds,
  }) {
    Object.assign(this, params);
  }

  // NewObjective creates a new virtual funding objective from a given request.
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    myAddress: Address,
    chainId: bigint,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
    let rightCC: ConsensusChannel | undefined;
    let ok: boolean = false;

    if (request.intermediaries.length > 0) {
      [rightCC, ok] = getTwoPartyConsensusLedger(request.intermediaries[0]);
    } else {
      [rightCC, ok] = getTwoPartyConsensusLedger(request.counterParty);
    }

    if (!ok) {
      throw new Error(`Could not find ledger for ${myAddress} and ${request.intermediaries[0]}`);
    }

    let leftCC: ConsensusChannel | undefined;

    const participants: Address[] = [myAddress, ...request.intermediaries, request.counterParty];

    const state = new State({
      participants,
      channelNonce: request.nonce,
      challengeDuration: request.challengeDuration,
      outcome: request.outcome,
      turnNum: 0,
      isFinal: false,
    });

    try {
      const objective = this.constructFromState(
        preApprove,
        state,
        myAddress,
        leftCC,
        rightCC,
      );

      return objective;
    } catch (err) {
      throw new Error(`Error creating objective: ${err}`);
    }
  }

  // constructFromState initiates an Objective from an initial state and set of ledgers.
  static constructFromState(
    preApprove: boolean,
    initialStateOfV: State,
    myAddress: Address,
    consensusChannelToMyLeft?: ConsensusChannel,
    consensusChannelToMyRight?: ConsensusChannel,
  ): Objective {
    const init: Objective = new Objective({});

    if (preApprove) {
      init.status = ObjectiveStatus.Approved;
    } else {
      init.status = ObjectiveStatus.Unapproved;
    }

    // Infer MyRole
    let found = false;
    for (let i = 0; i < initialStateOfV.participants.length; i += 1) {
      const addr = initialStateOfV.participants[i];
      if (addr === myAddress) {
        init.myRole = i;
        found = true;
      }
    }
    if (!found) {
      throw new Error('Not a participant in V');
    }

    const v: VirtualChannel = VirtualChannel.newVirtualChannel(initialStateOfV, init.myRole);
    init.v = v;

    // NewSingleHopVirtualChannel will error unless there are at least 3 participants
    init.n = initialStateOfV.participants.length - 2;

    init.a0 = new Funds(new Map<Address, bigint>());
    init.b0 = new Funds(new Map<Address, bigint>());

    for (const outcome of initialStateOfV.outcome.value) {
      const { asset } = outcome;

      if (outcome.allocations.value[0].destination !== Destination.addressToDestination(initialStateOfV.participants[0])) {
        throw new Error('Allocation in slot 0 does not correspond to participant 0');
      }
      const amount0 = outcome.allocations.value[0].amount;

      if (outcome.allocations.value[1].destination !== Destination.addressToDestination(initialStateOfV.participants[init.n + 1])) {
        throw new Error(`Allocation in slot 1 does not correspond to participant ${init.n + 1}`);
      }
      const amount1 = outcome.allocations.value[1].amount;

      if (!init.a0.value.has(asset)) {
        init.a0.value.set(asset, BigInt(0));
      }
      if (!init.b0.value.has(asset)) {
        init.b0.value.set(asset, BigInt(0));
      }
      init.a0.value.set(asset, init.a0.value.get(asset)! + amount0);
      init.b0.value.set(asset, init.b0.value.get(asset)! + amount1);
    }

    // Setup Ledger Channel Connections and expected guarantees

    // everyone other than Alice has a left-channel
    if (!init.isAlice()) {
      init.toMyLeft = new Connection({});

      if (!consensusChannelToMyLeft) {
        throw new Error('Non-Alice virtualfund objective requires non-null left ledger channel');
      }

      init.toMyLeft.channel = consensusChannelToMyLeft;
      init.toMyLeft.insertGuaranteeInfo(
        init.a0,
        init.b0,
        v.id,
        Destination.addressToDestination(init.v.participants[init.myRole - 1]),
        Destination.addressToDestination(init.v.participants[init.myRole]),
      );
    }

    if (!init.isBob()) {
      init.toMyRight = new Connection({});

      if (!consensusChannelToMyRight) {
        throw new Error('Non-Bob virtualfund objective requires non-null right ledger channel');
      }

      init.toMyRight.channel = consensusChannelToMyRight;
      init.toMyRight.insertGuaranteeInfo(
        init.a0,
        init.b0,
        init.v.id,
        Destination.addressToDestination(init.v.participants[init.myRole]),
        Destination.addressToDestination(init.v.participants[init.myRole + 1]),
      );
    }

    return init;
  }

  // ConstructObjectiveFromPayload takes in a message and constructs an objective from it.
  // It accepts the message, myAddress, and a function to to retrieve ledgers from a store.
  // TODO: Can throw an error
  // TODO: Implement
  static constructObjectiveFromPayload(
    p: ObjectivePayload,
    preapprove: boolean,
    myAddress: Address,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
    return {} as Objective;
  }

  // TODO: Implement
  id(): ObjectiveId {
    return '';
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  // TODO: Implement
  approve(): ObjectiveInterface {
    return new Objective({});
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  // TODO: Implement
  reject(): [Objective, SideEffects] {
    return [new Objective({}), new SideEffects({})];
  }

  // OwnsChannel returns the channel the objective exclusively owns.
  // TODO: Implement
  ownsChannel(): Destination {
    return new Destination();
  }

  // GetStatus returns the status of the objective.
  getStatus(): ObjectiveStatus {
    return this.status;
  }

  // TODO: Implement
  otherParticipants(): Address[] {
    return {} as Address[];
  }

  // TODO: Implement
  getPayload(raw: ObjectivePayload): SignedState {
    return {} as SignedState;
  }

  // TODO: Implement
  receiveProposal(sp: SignedProposal): ProposalReceiver {
    return {} as ProposalReceiver;
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  // TODO: Implement
  // TODO: Can throw an error
  update(payload: ObjectivePayload): ObjectiveInterface {
    return new Objective({});
  }

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  // TODO: Implement
  // TODO: Can throw an error
  crank(secretKey: Buffer): [Objective, SideEffects, WaitingFor] {
    return [new Objective({}), new SideEffects({}), ''];
  }

  // Related returns a slice of related objects that need to be stored along with the objective
  // TODO: Implement
  related(): Storable[] {
    return [];
  }

  /// ///////////////////////////////////////////////
  //  Private methods on the VirtualFundObjective //
  /// ///////////////////////////////////////////////

  // fundingComplete returns true if the appropriate ledger channel guarantees sufficient funds for J
  // TODO: Implement
  fundingComplete(): boolean {
    return false;
  }

  // Clone returns a deep copy of the receiver.
  // TODO: Implement
  clone(): Objective {
    return {} as Objective;
  }

  // isAlice returns true if the receiver represents participant 0 in the virtualfund protocol.
  private isAlice(): boolean {
    return this.myRole === 0;
  }

  // isBob returns true if the receiver represents participant n+1 in the virtualfund protocol.
  private isBob(): boolean {
    return this.myRole === this.n + 1;
  }

  // proposeLedgerUpdate will propose a ledger update to the channel by crafting a new state
  // TODO: Implement
  proposeLedgerUpdate(connection: Connection, sk: Buffer): SideEffects {
    return {} as SideEffects;
  }

  // acceptLedgerUpdate checks for a ledger state proposal and accepts that proposal if it satisfies the expected guarantee.
  // TODO: Implement
  acceptLedgerUpdate(c: Connection, sk: Buffer): SideEffects {
    return {} as SideEffects;
  }

  // updateLedgerWithGuarantee updates the ledger channel funding to include the guarantee.
  // TODO: Implement
  updateLedgerWithGuarantee(ledgerConnection: Connection, sk: Buffer): SideEffects {
    return {} as SideEffects;
  }
}

// IsVirtualFundObjective inspects a objective id and returns true if the objective id is for a virtual fund objective.
export function isVirtualFundObjective(id: ObjectiveId): boolean {
  return id.startsWith(ObjectivePrefix);
}

// ObjectiveResponse is the type returned across the API in response to the ObjectiveRequest.
export type ObjectiveResponse = {
  id: ObjectiveId
  channelId: Destination
};

// ObjectiveRequest represents a request to create a new virtual funding objective.
// TODO: Implement
export class ObjectiveRequest implements ObjectiveRequestInterface {
  intermediaries: Address[] = [];

  counterParty: Address = ethers.constants.AddressZero;

  challengeDuration: number = 0;

  outcome?: Exit;

  nonce: string = '0';

  appDefinition: Address = ethers.constants.AddressZero;

  private objectiveStarted?: ReadWriteChannel<null>;

  constructor(params: {
    intermediaries: Address[];
    counterParty: Address;
    challengeDuration: number;
    outcome?: Exit;
    nonce: string;
    appDefinition: Address;
    objectiveStarted?: ReadWriteChannel<null>;
  }) {
    Object.assign(this, params);
  }

  // NewObjectiveRequest creates a new ObjectiveRequest.
  static newObjectiveRequest(
    intermediaries: Address[],
    counterparty: Address,
    challengeDuration: number,
    outcome: Exit,
    nonce: string,
    appDefinition: Address,
  ): ObjectiveRequest {
    return new ObjectiveRequest({
      intermediaries,
      counterParty: counterparty,
      challengeDuration,
      outcome,
      nonce,
      appDefinition,
      objectiveStarted: Channel(),
    });
  }

  id(myAddress: Address, chainId: bigint): ObjectiveId {
    const idStr = this.channelId(myAddress).string();
    return `${objectivePrefix}${idStr}`;
  }

  // WaitForObjectiveToStart blocks until the objective starts
  async waitForObjectiveToStart(): Promise<void> {
    assert(this.objectiveStarted);
    await this.objectiveStarted.shift();
  }

  signalObjectiveStarted(): void {
    // TODO: Implement
  }

  // response computes and returns the appropriate response from the request.
  response(myAddress: Address): ObjectiveResponse {
    const channelId = this.channelId(myAddress);

    return {
      id: `${objectivePrefix}${channelId.string()}`,
      channelId,
    };
  }

  channelId(myAddress: Address): Destination {
    const participant: Address[] = [myAddress];
    participant.push(...this.intermediaries);
    participant.push(this.counterParty);

    const fixedPart = new FixedPart({
      participants: participant,
      channelNonce: this.nonce,
      challengeDuration: this.challengeDuration,
    });

    return fixedPart.channelId();
  }
}

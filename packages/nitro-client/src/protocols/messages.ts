import { Buffer } from 'buffer';
import { ethers } from 'ethers';

import {
  FieldDescription, JSONbigNative, Uint64, bytes2Hex, fromJSON, toJSON,
} from '@cerc-io/nitro-util';

import { SignedProposal, Proposal } from '../channel/consensus-channel/consensus-channel';
import { Voucher } from '../payments/vouchers';
import { Address } from '../types/types';

// ObjectiveId is a unique identifier for an Objective.
export type ObjectiveId = string;

// ObjectivePayload is a message containing a payload of []byte that an objective is responsible for decoding.
export type ObjectivePayload = {
  // PayloadData is the serialized json payload
  payloadData: Buffer

  // ObjectiveId is the id of the objective that is responsible for decoding and handling the payload
  objectiveId: ObjectiveId

  // Type is the type of the payload the message contains.
  // This is useful when a protocol wants to handle different types of payloads.
  type: PayloadType
};

export type PayloadType = string;

const objectivePayloadJsonEncodingMap: Record<string, FieldDescription> = {
  payloadData: { type: 'buffer' },
  objectiveId: { type: 'string' },
  type: { type: 'string' },
};

// CreateObjectivePayload generates an objective message from the given objective id and payload.
// CreateObjectivePayload handles serializing `p` into json.
const createObjectivePayload = (id: ObjectiveId, payloadType: PayloadType, p: any): ObjectivePayload => {
  try {
    const payloadData: Buffer = Buffer.from(JSONbigNative.stringify(p));
    return { payloadData, objectiveId: id, type: payloadType };
  } catch (err) {
    throw new Error(`Failed to create objective payload: ${err}`);
  }
};

// MessageSummary is a summary of a message suitable for logging.
interface MessageSummary {
  to: string;
  from: string;
  payloadSummaries: ObjectivePayloadSummary[];
  proposalSummaries: ProposalSummary[];
  payments: PaymentSummary[];
  rejectedObjectives: string[];
}

// ObjectivePayloadSummary is a summary of an objective payload suitable for logging.
interface ObjectivePayloadSummary {
  objectiveId: string;
  type: string;
  payloadDataSize: number;
}

// ProposalSummary is a summary of a proposal suitable for logging.
interface ProposalSummary {
  objectiveId: string;
  ledgerId: string;
  proposalType: string;
  turnNum: Uint64;
}

// PaymentSummary is a summary of a payment voucher suitable for logging.
interface PaymentSummary {
  amount: Uint64;
  channelId: string;
}

// GetProposalObjectiveId returns the objectiveId for a proposal.
export function getProposalObjectiveId(p: Proposal): ObjectiveId {
  switch (p.type()) {
    case 'AddProposal': {
      const prefix = 'VirtualFund-';
      const channelId = p.toAdd.target().toString();
      return prefix + channelId;
    }
    case 'RemoveProposal': {
      const prefix = 'VirtualDefund-';
      const channelId = p.toRemove.target.toString();
      return prefix + channelId;
    }
    default: {
      throw new Error('invalid proposal type');
    }
  }
}

// Message is an object to be sent across the wire.
export class Message {
  to: Address = ethers.constants.AddressZero;

  from: Address = ethers.constants.AddressZero;

  // ObjectivePayloads contains a collection of payloads for various objectives.
  // Protocols are responsible for parsing the payload.
  objectivePayloads: ObjectivePayload[] = [];

  // LedgerProposals contains a collection of signed proposals.
  // Since proposals need to be handled in order they need to be an explicit part of the message format.
  ledgerProposals: SignedProposal[] = [];

  // Payments contains a collection of signed vouchers representing payments.
  // Payments are handled outside of any objective.
  payments: Voucher[] = [];

  // RejectedObjectives is a collection of objectives that have been rejected.
  rejectedObjectives: ObjectiveId[] = [];

  static jsonEncodingMap: Record<string, FieldDescription> = {
    to: { type: 'address' },
    from: { type: 'address' },
    objectivePayloads: { type: 'array', value: { type: 'object', value: objectivePayloadJsonEncodingMap } },
    ledgerProposals: { type: 'array', value: { type: 'class', value: SignedProposal } },
    payments: { type: 'array', value: { type: 'class', value: Voucher } },
    rejectedObjectives: { type: 'array', value: { type: 'string' } },
  };

  static fromJSON(data: string): Message {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Message(props);
  }

  toJSON(): any {
    return toJSON(Message.jsonEncodingMap, this);
  }

  constructor(params: {
    to?: Address;
    from?: Address;
    objectivePayloads?: ObjectivePayload[];
    ledgerProposals?: SignedProposal[];
    payments?: Voucher[];
    rejectedObjectives?: ObjectiveId[];
  }) {
    Object.assign(this, params);
  }

  // createObjectivePayloadMessage returns a message for each recipient tht contains an objective payload.
  static createObjectivePayloadMessage(id: ObjectiveId, p: any, payloadType: PayloadType, ...recipients: Address[]): Message[] {
    const messages: Message[] = [];

    for (const participant of recipients) {
      const payload = createObjectivePayload(id, payloadType, p);
      const message: Message = new Message({ to: participant, objectivePayloads: [payload] });
      messages.push(message);
    }

    return messages;
  }

  // CreateSignedProposalMessage returns a signed proposal message addressed to the counterparty in the given ledger
  // It contains the provided signed proposals and any proposals in the proposal queue.
  static createRejectionNoticeMessage(oId: ObjectiveId, ...recipients: Address[]): Message[] {
    const messages: Message[] = [];

    for (const recipient of recipients) {
      const message: Message = new Message({ to: recipient, rejectedObjectives: [oId] });
      messages.push(message);
    }

    return messages;
  }

  // CreateSignedProposalMessage returns a signed proposal message addressed to the counterparty in the given ledger channel.
  // The proposals MUST be sorted by turnNum
  // since the ledger protocol relies on the message receipient processing the proposals in that order. See ADR 4.
  static createSignedProposalMessage(recipient: Address, ...proposals: SignedProposal[]): Message {
    const msg = new Message({ to: recipient, ledgerProposals: proposals });
    return msg;
  }

  // CreateVoucherMessage returns a signed voucher message for each of the recipients provided.
  static createVoucherMessage(voucher: Voucher, ...recipients: Address[]): Message[] {
    const messages: Message[] = [];
    for (const recipient of recipients) {
      messages.push(
        new Message({
          to: recipient,
          payments: [voucher],
        }),
      );
    }

    return messages;
  }

  // Serialize serializes the message into a string.
  serialize(): string {
    const bytes = Buffer.from(JSONbigNative.stringify(this));
    return bytes.toString();
  }

  // Summarize returns a MessageSummary for the message that is suitable for logging
  summarize(): MessageSummary {
    const s: MessageSummary = {
      to: this.to.slice(0, 8),
      from: this.from.slice(0, 8),
      payloadSummaries: this.objectivePayloads.map((p): ObjectivePayloadSummary => ({
        objectiveId: p.objectiveId.toString(),
        type: p.type.toString(),
        payloadDataSize: p.payloadData.length,
      })),
      proposalSummaries: this.ledgerProposals.map((p): ProposalSummary => {
        let objIdString = '';
        try {
          const objId = getProposalObjectiveId(p.proposal);
          objIdString = objId.toString();
        } catch (err) {
          objIdString = (err as Error).message; // Use error message as objective id
        }
        return {
          objectiveId: objIdString,
          ledgerId: p.channelID().toString(),
          turnNum: p.turnNum,
          proposalType: p.proposal.type().toString(),
        };
      }),
      payments: this.payments.map((p): PaymentSummary => ({
        amount: p.amount,
        channelId: p.channelId.toString(),
      })),
      rejectedObjectives: this.rejectedObjectives.map((o) => o.toString()),
    };

    return s;
  }
}

// DeserializeMessage deserializes the passed string into a protocols.Message.
export function deserializeMessage(s: string): Message {
  return Message.fromJSON(s);
}

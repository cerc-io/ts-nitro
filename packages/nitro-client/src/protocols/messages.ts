import { SignedProposal } from '../channel/consensus-channel/consensus-channel';
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

// CreateObjectivePayload generates an objective message from the given objective id and payload.
// CreateObjectivePayload handles serializing `p` into json.
const createObjectivePayload = (id: ObjectiveId, payloadType: PayloadType, p: any): ObjectivePayload => {
  try {
    const payloadData: Buffer = Buffer.from(JSON.stringify(p));
    return { payloadData, objectiveId: id, type: payloadType };
  } catch (err) {
    throw new Error(`Failed to create objective payload: ${err}`);
  }
};

// Message is an object to be sent across the wire.
// TODO: Implement
export class Message {
  to: Address = '';

  from: Address = '';

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

  // Serialize serializes the message into a string.
  // TODO: Can throw an error
  // TODO: Implement
  serialize(): string {
    return '';
  }

  // Summarize returns a MessageSummary for the message that is suitable for logging
  // TODO: Implement
  summarize(): MessageSummary {
    return {};
  }
}

// MessageSummary is a summary of a message suitable for logging.
// TODO: Implement
export class MessageSummary {}

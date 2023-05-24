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

type PayloadType = string;

// Message is an object to be sent across the wire.
// TODO: Implement
export class Message {
  to?: Address;

  from?: Address;

  // ObjectivePayloads contains a collection of payloads for various objectives.
  // Protocols are responsible for parsing the payload.
  objectivePayloads?: ObjectivePayload[];

  // LedgerProposals contains a collection of signed proposals.
  // Since proposals need to be handled in order they need to be an explicit part of the message format.
  ledgerProposals?: SignedProposal[];

  // Payments contains a collection of signed vouchers representing payments.
  // Payments are handled outside of any objective.
  payments?: Voucher[];

  // RejectedObjectives is a collection of objectives that have been rejected.
  rejectedObjectives?: ObjectiveId[];

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

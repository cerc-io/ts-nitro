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

// TODO: Implement
export class Message {}

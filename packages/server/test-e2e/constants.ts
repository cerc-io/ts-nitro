// Message service ports for Alice's and Bob's clients
export const ALICE_MESSAGING_PORT = 3005;
export const BOB_MESSAGING_PORT = 3006;

export const METRICS_CHANNEL_KEYS = [
  'api_objective_request_queue',
  'api_payment_request_queue',
  'chain_events_queue',
  'messages_queue',
  'proposal_queue',
];

export const METRICS_MESSAGE_KEYS_VALUES = {
  msg_proposal_count: 0,
  msg_payment_count: 0,
  msg_payload_count: 1,
  msg_size: 1414,
};

// ChainTransaction defines the interface that every transaction must implement
// TODO: Add methods
export interface ChainTransaction {}

// Objective is the interface for off-chain protocols.
// The lifecycle of an objective is as follows:
//   - It is initialized by a single client (passing in various parameters). It is implicitly approved by that client.
//     It is communicated to the other clients.
//   - It is stored and then approved or rejected by the other clients
//   - It is updated with external information arriving to the client
//   - After each update, it is cranked. This generates side effects and other metadata
//   - The metadata will eventually indicate that the Objective has stalled OR the Objective has completed successfully
// TODO: Add methods
export interface Objective {}

// ObjectiveId is a unique identifier for an Objective.
export type ObjectiveId = string;

// ObjectiveRequest is a request to create a new objective.
// TODO: Add methods
export interface ObjectiveRequest {}

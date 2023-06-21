import { Buffer } from 'buffer';

import { Objective } from '../../../protocols/interfaces';
import { Channel } from '../../../channel/channel';
import { ConsensusChannel } from '../../../channel/consensus-channel/consensus-channel';
import { VoucherStore } from '../../../payments/voucher-manager';
import { Address } from '../../../types/types';
import { Destination } from '../../../types/destination';
import { ObjectiveId } from '../../../protocols/messages';

export const ErrNoSuchObjective = new Error('store: no such objective');
export const ErrNoSuchChannel = new Error('store: failed to find required channel data');

// Store is responsible for persisting objectives, objective metadata, states, signatures, private keys and blockchain data
export interface Store extends ConsensusChannelStore, VoucherStore {
  // Get a pointer to a secret key for signing channel updates
  getChannelSecretKey (): Buffer

  // Get the (Ethereum) address associated with the ChannelSecretKey
  getAddress (): Address

  // Read an existing objective
  // TODO: Can throw an error
  getObjectiveById (id: ObjectiveId): Objective

  // Get the objective that currently owns the channel with the supplied ChannelId
  // TODO: Can throw an error
  getObjectiveByChannelId (channelId: Destination): [Objective | undefined, boolean]

  // Write an objective
  // TODO: Can throw an error
  setObjective (obj: Objective): void

  // Returns a collection of channels with the given ids
  // TODO: Can throw an error
  getChannelsByIds (ids: string[]): Channel[]

  // TODO: Can throw an error
  getChannelById (id: Destination): [Channel, boolean]

  // Returns any channels that includes the given participant
  getChannelsByParticipant (participant: Address): Channel[]

  // TODO: Can throw an error
  setChannel (ch: Channel): void

  destroyChannel (id: Destination): void

  // Returns any channels that includes the given app definition
  // TODO: Can throw an error
  getChannelsByAppDefinition (appDef: Address): Channel[]

  // Release channel from being owned by any objective
  releaseChannelFromOwnership (channelId: Destination): void

  // The behavior of Close after the first call is undefined
  // TODO: Check for io.Closer alternative
  // TODO: Can throw an error
  close (): void
}

export interface ConsensusChannelStore {
  // TODO: Can throw an error
  getAllConsensusChannels (): ConsensusChannel[]

  // TODO: Can throw an error
  getConsensusChannel (counterparty: Address): [ConsensusChannel | undefined, boolean]

  // TODO: Can throw an error
  getConsensusChannelById (id: Destination): ConsensusChannel | undefined

  // TODO: Can throw an error
  setConsensusChannel (ch: ConsensusChannel): void

  destroyConsensusChannel (id: Destination): void
}

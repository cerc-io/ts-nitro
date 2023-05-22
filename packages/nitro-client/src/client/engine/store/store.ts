import { AddressLike } from 'ethers';

import { Objective } from '../../../protocols/interfaces';
import { Channel } from '../../../channel/channel';

export interface Store {
  // Get a pointer to a secret key for signing channel updates
  getChannelSecretKey (): string

  // Get the (Ethereum) address associated with the ChannelSecretKey
  getAddress (): AddressLike

  // Read an existing objective
  // TODO: Can throw an error
  getObjectiveById (): Objective

  // Get the objective that currently owns the channel with the supplied ChannelId
  // TODO: Can throw an error
  getObjectiveByChannelId (channelId: string): Objective

  // Write an objective
  // TODO: Can throw an error
  SetObjective(obj: Objective): void

  // Returns a collection of channels with the given ids
  // TODO: Can throw an error
  getChannelsByIds (ids: string[]): Channel

  // TODO: Can throw an error
  getChannelById (id: string): Channel

  // Returns any channels that includes the given participant
  getChannelsByParticipant (participant: AddressLike): Channel[]

  // TODO: Can throw an error
  setChannel (ch: Channel): void

  destroyChannel (id: string): void

  // Returns any channels that includes the given app definition
  // TODO: Can throw an error
  getChannelsByAppDefinition (appDef: AddressLike): Channel[]

  // Release channel from being owned by any objective
  releaseChannelFromOwnership (channelId: string): void
}

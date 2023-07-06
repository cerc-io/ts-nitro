import { Buffer } from 'buffer';

import type { ReadChannel } from '@cerc-io/ts-channel';
// @ts-expect-error
import type { PeerId } from '@libp2p/interface-peer-id';
// @ts-expect-error
import { Multiaddr } from '@multiformats/multiaddr';

import { Message } from '../../../../protocols/messages';
import { Address } from '../../../../types/types';
import { MessageService } from '../messageservice';
import { BaseP2PMessageService, BasicPeerInfo, PeerInfo } from './service';

// P2PMessageService is a rudimentary message service that uses TCP to send and receive messages.
export class P2PMessageService implements MessageService {
  private baseP2PMessageService: BaseP2PMessageService;

  constructor({
    baseP2PMessageService,
  }: {
    baseP2PMessageService: BaseP2PMessageService
  }) {
    this.baseP2PMessageService = baseP2PMessageService;
  }

  // newMessageService returns a running P2PMessageService listening on the given message key.
  static async newMessageService(
    relayMultiAddr: string,
    me: Address,
    pk: Buffer,
    logWriter?: WritableStream,
  ): Promise<P2PMessageService> {
    const baseP2PMessageService = await BaseP2PMessageService.newMessageService(
      relayMultiAddr,
      me,
      pk,
      {},
      logWriter,
    );

    return new P2PMessageService({
      baseP2PMessageService,
    });
  }

  // id returns the libp2p peer ID of the message service.
  async id(): Promise<PeerId> {
    return this.baseP2PMessageService.id();
  }

  // Sends messages to other participants.
  // It blocks until the message is sent.
  // It will retry establishing a stream NUM_CONNECT_ATTEMPTS times before giving up
  async send(msg: Message) {
    return this.baseP2PMessageService.send(msg);
  }

  // out returns a channel that can be used to receive messages from the message service
  out(): ReadChannel<Message> {
    return this.baseP2PMessageService.out();
  }

  // Closes the P2PMessageService
  close(): Promise<void> {
    return this.baseP2PMessageService.close();
  }

  // peerInfoReceived returns a channel that receives a PeerInfo when a peer is discovered
  peerInfoReceived(): ReadChannel<BasicPeerInfo> {
    return this.baseP2PMessageService.peerInfoReceived();
  }

  /* eslint-disable no-continue */
  // AddPeers adds the peers to the message service.
  // We ignore peers that are ourselves.
  async addPeers(peers: PeerInfo[]) {
    return this.baseP2PMessageService.addPeers(peers);
  }

  // Custom method to add peer using multiaddr
  // Used for adding peers that support transports other than tcp
  async addPeerByMultiaddr(clientAddress: Address, multiaddr: Multiaddr) {
    return this.baseP2PMessageService.addPeerByMultiaddr(clientAddress, multiaddr);
  }
}

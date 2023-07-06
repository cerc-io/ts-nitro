import { Buffer } from 'buffer';
import assert from 'assert';

import type { ReadChannel } from '@cerc-io/ts-channel';
// @ts-expect-error
import { PeerInitConfig } from '@cerc-io/peer';
// @ts-expect-error
import type { MulticastDNSComponents } from '@libp2p/mdns';
// @ts-expect-error
import type { PeerDiscovery } from '@libp2p/interface-peer-discovery';
// @ts-expect-error
import type { PeerId } from '@libp2p/interface-peer-id';
// @ts-expect-error
import { Multiaddr } from '@multiformats/multiaddr';

import { Message } from '../../../../protocols/messages';
import { Address } from '../../../../types/types';
import { MessageService } from '../messageservice';
import { BaseP2PMessageService, BasicPeerInfo, PeerInfo } from './service';

const MDNS_TAG = 'ts-nitro';

// P2PMessageService is a rudimentary message service that uses TCP to send and receive messages.
export class P2PMessageService implements MessageService {
  private baseP2PMessageService: BaseP2PMessageService;

  private mdns?: (components: MulticastDNSComponents) => PeerDiscovery;

  constructor({
    baseP2PMessageService,
    mdns,
  }: {
    baseP2PMessageService: BaseP2PMessageService
    mdns?: (components: MulticastDNSComponents) => PeerDiscovery;
  }) {
    this.baseP2PMessageService = baseP2PMessageService;
    this.mdns = mdns;
  }

  // newMessageService returns a running P2PMessageService listening on the given ip, port and message key.
  // If useMdnsPeerDiscovery is true, the message service will use mDNS to discover peers.
  // Otherwise, peers must be added manually via `AddPeers`.
  static async newMessageService(
    relayMultiAddr: string,
    ip: string,
    port: number,
    me: Address,
    pk: Buffer,
    useMdnsPeerDiscovery: boolean,
    logWriter?: WritableStream,
  ): Promise<P2PMessageService> {
    const { tcp } = await import('@libp2p/tcp');
    let mdnsService: ((components: MulticastDNSComponents) => PeerDiscovery) | undefined;

    const initOptions: PeerInitConfig = {
      transports: [
        tcp(),
      ],
      listenMultiaddrs: [`/ip4/${ip}/tcp/${port}`],
    };

    if (useMdnsPeerDiscovery) {
      // @ts-expect-error
      const { mdns } = await import('@libp2p/mdns');
      mdnsService = mdns({
        interval: 20e3,
        serviceTag: MDNS_TAG,
      });

      assert(mdnsService);
      initOptions.peerDiscovery = [
        mdnsService,
      ];
    }

    const baseP2PMessageService = await BaseP2PMessageService.newMessageService(
      relayMultiAddr,
      me,
      pk,
      initOptions,
      logWriter,
    );

    return new P2PMessageService({
      baseP2PMessageService,
      mdns: mdnsService,
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

import debug from 'debug';
// https://github.com/microsoft/TypeScript/issues/49721
// @ts-expect-error
import type { Libp2p } from 'libp2p';

// @ts-expect-error
import type { PrivateKey } from '@libp2p/crypto';
// @ts-expect-error
import type { MulticastDNSComponents } from '@libp2p/mdns';
// @ts-expect-error
import type { PeerDiscovery } from '@libp2p/interface-peer-discovery';

import { GoChannelPlaceholder } from '../../../../go-channel';
import { Map } from '../../../../internal/safesync/safesync';
import { Message } from '../../../../protocols/messages';
import { Address } from '../../../../types/types';

// BasicPeerInfo contains the basic information about a peer
interface BasicPeerInfo {
  id: string;
  address: Address;
}

// P2PMessageService is a rudimentary message service that uses TCP to send and receive messages.
export class P2PMessageService {
  // For forwarding processed messages to the engine
  private toEngine: GoChannelPlaceholder<Message>;

  private peers: Map<BasicPeerInfo>;

  private me: Address;

  private key: PrivateKey;

  private p2pHost: Libp2p;

  private mdns: (components: MulticastDNSComponents) => PeerDiscovery;

  private newPeerInfo: GoChannelPlaceholder<BasicPeerInfo>;

  private logger: debug.Debugger;

  constructor(
    toEngine: GoChannelPlaceholder<Message>,
    peers: Map<BasicPeerInfo>,
    me: Address,
    key: PrivateKey,
    p2pHost: Libp2p,
    mdns: (components: MulticastDNSComponents) => PeerDiscovery,
    newPeerInfo: GoChannelPlaceholder<BasicPeerInfo>,
    logger: debug.Debugger,
  ) {
    this.toEngine = toEngine;
    this.peers = peers;
    this.me = me;
    this.key = key;
    this.p2pHost = p2pHost;
    this.mdns = mdns;
    this.newPeerInfo = newPeerInfo;
    this.logger = logger;
  }

  // newMessageService returns a running P2PMessageService listening on the given ip, port and message key.
  // If useMdnsPeerDiscovery is true, the message service will use mDNS to discover peers.
  // Otherwise, peers must be added manually via `AddPeers`.
  // TODO: Implement and remove void
  static newMessageService(
    ip: string,
    port: number,
    me: Address,
    pk: Uint8Array,
    useMdnsPeerDiscovery: boolean,
    logWriter: WritableStream,
  ): P2PMessageService | void {}
}

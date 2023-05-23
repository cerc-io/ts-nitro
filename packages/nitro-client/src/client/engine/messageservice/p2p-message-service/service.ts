import debug from 'debug';
// https://github.com/microsoft/TypeScript/issues/49721
// @ts-expect-error
import type { Libp2p } from 'libp2p';
import type { ReadChannel, ReadWriteChannel } from '@nodeguy/channel';

// @ts-expect-error
import type { PrivateKey } from '@libp2p/crypto';
// @ts-expect-error
import type { MulticastDNSComponents } from '@libp2p/mdns';
// @ts-expect-error
import type { PeerDiscovery } from '@libp2p/interface-peer-discovery';
// @ts-expect-error
import type { Stream } from '@libp2p/interface-connection';
// @ts-expect-error
import type { Multiaddr } from '@multiformats/multiaddr';

import { SyncMap } from '../../../../internal/safesync/safesync';
import { Message } from '../../../../protocols/messages';
import { Address } from '../../../../types/types';

// BasicPeerInfo contains the basic information about a peer
interface BasicPeerInfo {
  id: string;
  address: Address;
}

// PeerInfo contains peer information and the ip address/port
interface PeerInfo {
  port: number;
  id: string;
  address: Address;
  ipAddress: string;
}

// P2PMessageService is a rudimentary message service that uses TCP to send and receive messages.
export class P2PMessageService {
  // For forwarding processed messages to the engine
  private toEngine: ReadWriteChannel<Message>;

  private peers: SyncMap<BasicPeerInfo>;

  private me: Address;

  private key: PrivateKey;

  private p2pHost: Libp2p;

  private mdns: (components: MulticastDNSComponents) => PeerDiscovery;

  private newPeerInfo: ReadWriteChannel<BasicPeerInfo>;

  private logger: debug.Debugger;

  constructor(
    toEngine: ReadWriteChannel<Message>,
    peers: SyncMap<BasicPeerInfo>,
    me: Address,
    key: PrivateKey,
    p2pHost: Libp2p,
    mdns: (components: MulticastDNSComponents) => PeerDiscovery,
    newPeerInfo: ReadWriteChannel<BasicPeerInfo>,
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

  // id returns the libp2p peer ID of the message service.
  // TODO: Implement and remove void
  id(): string | void {}

  // handlePeerFound is called by the mDNS service when a peer is found.
  // TODO: Implement and remove void
  handlePeerFound(pi: Multiaddr[]) {}

  // TODO: Implement
  private msgStreamHandler(stream: Stream) {}

  // sendPeerInfo sends our peer info over the given stream
  // TODO: Implement
  private sendPeerInfo(stream: Stream) {}

  // receivePeerInfo receives peer info from the given stream
  // TODO: Implement
  private receivePeerInfo(stream: Stream) {}

  // Sends messages to other participants.
  // It blocks until the message is sent.
  // It will retry establishing a stream NUM_CONNECT_ATTEMPTS times before giving up
  // TODO: Implement
  send(msg: Message) {}

  // checkError panics if the message service is running and there is an error, otherwise it just returns
  // TODO: Implement
  // eslint-disable-next-line n/handle-callback-err
  private checkError(err: Error) {}

  // out returns a channel that can be used to receive messages from the message service
  // TODO: Implement and remove void
  out(): ReadChannel<Message> | void {}

  // Closes the P2PMessageService
  // TODO: Implement and remove void
  close(): Error | void {}

  // peerInfoReceived returns a channel that receives a PeerInfo when a peer is discovered
  // TODO: Implement and remove void
  peerInfoReceived(): ReadChannel<BasicPeerInfo> | void {}

  // AddPeers adds the peers to the message service.
  // We ignore peers that are ourselves.
  // TODO: Implement
  addPeers(peers: PeerInfo[]) {}
}

import assert from 'assert';
import debug from 'debug';
// https://github.com/microsoft/TypeScript/issues/49721
// @ts-expect-error
import type { Libp2p, Libp2pOptions } from 'libp2p';

import createChannel from '@nodeguy/channel';
import type { ReadChannel, ReadWriteChannel } from '@nodeguy/channel';
// @ts-expect-error
import type { PrivateKey } from '@libp2p/interface-keys';
// @ts-expect-error
import type { MulticastDNSComponents } from '@libp2p/mdns';
// @ts-expect-error
import type { PeerDiscovery } from '@libp2p/interface-peer-discovery';
// @ts-expect-error
import type { Stream } from '@libp2p/interface-connection';
// @ts-expect-error
import type { IncomingStreamData } from '@libp2p/interface-registrar';
// @ts-expect-error
import type { PeerInfo as Libp2pPeerInfo } from '@libp2p/interface-peer-info';

import { SyncMap } from '../../../../internal/safesync/safesync';
import { Message } from '../../../../protocols/messages';
import { Address } from '../../../../types/types';
import { MessageService } from '../messageservice';

const log = debug('ts-nitro:p2p-message-service');

const PROTOCOL_ID = '/go-nitro/msg/1.0.0';
const PEER_EXCHANGE_PROTOCOL_ID = '/go-nitro/peerinfo/1.0.0';
const BUFFER_SIZE = 1_000;

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

interface ConstructorOptions {
  toEngine: ReadWriteChannel<Message>;
  peers: SyncMap<BasicPeerInfo>;
  me: Address;
  newPeerInfo: ReadWriteChannel<BasicPeerInfo>;
  logger: debug.Debugger;
  key?: PrivateKey;
  p2pHost?: Libp2p;
  mdns?: (components: MulticastDNSComponents) => PeerDiscovery;
}

// P2PMessageService is a rudimentary message service that uses TCP to send and receive messages.
export class P2PMessageService implements MessageService {
  // For forwarding processed messages to the engine
  private toEngine: ReadWriteChannel<Message>;

  private peers: SyncMap<BasicPeerInfo>;

  private me: Address;

  private key?: PrivateKey;

  private p2pHost?: Libp2p;

  private mdns?: (components: MulticastDNSComponents) => PeerDiscovery;

  private newPeerInfo: ReadWriteChannel<BasicPeerInfo>;

  private logger: debug.Debugger;

  constructor({
    toEngine,
    peers,
    me,
    key,
    p2pHost,
    mdns,
    newPeerInfo,
    logger,
  }: ConstructorOptions) {
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
  static async newMessageService(
    ip: string,
    port: number,
    me: Address,
    pk: Uint8Array,
    useMdnsPeerDiscovery: boolean,
    logWriter?: WritableStream,
  ): Promise<P2PMessageService> {
    const ms = new P2PMessageService({
      toEngine: createChannel<Message>(BUFFER_SIZE),
      newPeerInfo: createChannel<BasicPeerInfo>(BUFFER_SIZE),
      peers: new SyncMap<BasicPeerInfo>(),
      me,
      logger: log,
    });

    const { unmarshalPrivateKey } = await import('@libp2p/crypto/keys');

    try {
      const messageKey = await unmarshalPrivateKey(pk);
      ms.key = messageKey;
    } catch (err) {
      ms.checkError(err as Error);
    }

    assert(ms.key);
    const PeerIdFactory = await import('@libp2p/peer-id-factory');
    const { tcp } = await import('@libp2p/tcp');
    const { yamux } = await import('@chainsafe/libp2p-yamux');

    const options: Libp2pOptions = {
      peerId: await PeerIdFactory.createFromPrivKey(ms.key),
      addresses: {
        listen: [`/ip4/${ip}/tcp/${port}`],
      },
      transports: [
        tcp(),
      ],
      streamMuxers: [
        yamux(),
      ],
      // libp2p.NoSecurity,
    };

    if (useMdnsPeerDiscovery) {
      const { mdns } = await import('@libp2p/mdns');

      options.peerDiscovery = [
        mdns({
          interval: 20e3,
        }),
      ];
    }

    const { createLibp2p } = await import('libp2p');
    const host = await createLibp2p(options);
    ms.p2pHost = host;

    ms.p2pHost.addEventListener('peer:discovery', ms.handlePeerFound.bind(ms));

    ms.p2pHost.handle(PROTOCOL_ID, ms.msgStreamHandler);

    ms.p2pHost.handle(PEER_EXCHANGE_PROTOCOL_ID, ({ stream }) => {
      ms.receivePeerInfo(stream);
      stream.close();
    });

    return ms;
  }

  // id returns the libp2p peer ID of the message service.
  // TODO: Implement and remove void
  id(): string | void {}

  // handlePeerFound is called by the mDNS service when a peer is found.
  async handlePeerFound({ detail: pi }: CustomEvent<Libp2pPeerInfo>) {
    assert(this.p2pHost);

    const peer = await this.p2pHost.peerStore.save(
      pi.id,
      {
        multiaddrs: pi.multiaddrs,
        // TODO: Check if ttl option exists to set it like in go-nitro
        // peerstore.PermanentAddrTTL
      },
    );

    try {
      const stream = await this.p2pHost.dialProtocol(
        peer.id,
        PEER_EXCHANGE_PROTOCOL_ID,
      );

      this.sendPeerInfo(stream);
      stream.close();
    } catch (err) {
      this.checkError(err as Error);
    }
  }

  // TODO: Implement
  private msgStreamHandler({ stream }: IncomingStreamData) {}

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
  out(): ReadChannel<Message> {
    return this.toEngine;
  }

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

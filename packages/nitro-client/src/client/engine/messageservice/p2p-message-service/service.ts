import assert from 'assert';
import debug from 'debug';
import { ethers } from 'ethers';
// https://github.com/microsoft/TypeScript/issues/49721
// @ts-expect-error
import type { Libp2p, Libp2pOptions } from 'libp2p';

import Channel from '@nodeguy/channel';
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
import type { PeerId } from '@libp2p/interface-peer-id';
// @ts-expect-error
import type { Address as PeerAddress } from '@libp2p/interface-peer-store';
// @ts-expect-error
import type { Multiaddr } from '@multiformats/multiaddr';

import { SafeSyncMap } from '../../../../internal/safesync/safesync';
import { Message, deserializeMessage } from '../../../../protocols/messages';
import { Address } from '../../../../types/types';
import { MessageService } from '../messageservice';

const log = debug('ts-nitro:p2p-message-service');

const PROTOCOL_ID = '/go-nitro/msg/1.0.0';
const PEER_EXCHANGE_PROTOCOL_ID = '/go-nitro/peerinfo/1.0.0';
const DELIMITER = '\n';
const BUFFER_SIZE = 1_000;
const NUM_CONNECT_ATTEMPTS = 20;
const RETRY_SLEEP_DURATION = 5 * 1000; // milliseconds

// BasicPeerInfo contains the basic information about a peer
interface BasicPeerInfo {
  id: PeerId;
  address: Address;
}

// Custom function to parse raw JSON string to BasicPeerInfo
async function parseBasicPeerInfo(raw: string): Promise<BasicPeerInfo> {
  const { peerIdFromString } = await import('@libp2p/peer-id');

  const parsed = JSON.parse(raw);

  return {
    id: peerIdFromString(parsed.id),
    address: parsed.address,
  };
}

// PeerInfo contains peer information and the ip address/port
interface PeerInfo {
  port: number;
  id: PeerId;
  address: Address;
  ipAddress: string;
}

interface ConstructorOptions {
  toEngine: ReadWriteChannel<Message>;
  peers: SafeSyncMap<BasicPeerInfo>;
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

  private peers: SafeSyncMap<BasicPeerInfo>;

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
      toEngine: Channel<Message>(BUFFER_SIZE),
      newPeerInfo: Channel<BasicPeerInfo>(BUFFER_SIZE),
      peers: new SafeSyncMap<BasicPeerInfo>(),
      me: ethers.utils.getAddress(me),
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
    const { noise } = await import('@chainsafe/libp2p-noise');

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
      // Use noise() instead
      connectionEncryption: [noise()],
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

    await ms.p2pHost.handle(PROTOCOL_ID, ms.msgStreamHandler.bind(ms));

    await ms.p2pHost.handle(PEER_EXCHANGE_PROTOCOL_ID, ({ stream }) => {
      ms.receivePeerInfo(stream).then(() => {
        stream.close();
      });
    });

    return ms;
  }

  // id returns the libp2p peer ID of the message service.
  async id(): Promise<PeerId> {
    const PeerIdFactory = await import('@libp2p/peer-id-factory');

    assert(this.key);
    return PeerIdFactory.createFromPrivKey(this.key);
  }

  // handlePeerFound is called by the mDNS service when a peer is found.
  async handlePeerFound({ detail: pi }: any) {
    assert(this.p2pHost);

    const peerMultiaddrs: Multiaddr[] = pi.addresses.map((address: PeerAddress) => address.multiaddr);
    const peer = await this.p2pHost.peerStore.save(
      pi.id,
      {
        multiaddrs: peerMultiaddrs,
        // TODO: Check if ttl option exists to set it like in go-nitro
        // peerstore.PermanentAddrTTL
      },
    );

    try {
      const stream = await this.p2pHost.dialProtocol(
        peer.id,
        PEER_EXCHANGE_PROTOCOL_ID,
      );

      await this.sendPeerInfo(stream);
      stream.close();
    } catch (err) {
      this.checkError(err as Error);
    }
  }

  private async msgStreamHandler({ stream }: IncomingStreamData) {
    const { pipe } = await import('it-pipe');
    const { toString: uint8ArrayToString } = await import('uint8arrays/to-string');

    let raw: string = '';
    try {
      await pipe(
        stream.source,
        async (source) => {
          let temp: string = '';
          for await (const msg of source) {
            temp += uint8ArrayToString(msg.subarray());

            // TODO: Find a better way of doing this
            const delimiterIndex = temp.indexOf(DELIMITER);
            if (delimiterIndex !== -1) {
              raw = temp.slice(0, delimiterIndex);
              break;
            }
          }
        },
      );
    } catch (err) {
      this.checkError(err as Error);
    }

    // An EOF means the stream has been closed by the other side.
    // Check if 'raw' is empty in place of EOF error
    if (raw === '') {
      return;
    }

    let m;
    try {
      m = deserializeMessage(raw);
    } catch (err) {
      this.checkError(err as Error);
    }
    assert(m);

    await this.toEngine.push(m);
    stream.close();
  }

  // sendPeerInfo sends our peer info over the given stream
  private async sendPeerInfo(stream: Stream): Promise<void> {
    let raw: string = '';
    try {
      const peerId = await this.id();
      const peerInfo: BasicPeerInfo = {
        id: peerId,
        address: this.me,
      };

      raw = JSON.stringify(peerInfo);
    } catch (err) {
      this.checkError(err as Error);
    }

    const { pipe } = await import('it-pipe');
    const { fromString: uint8ArrayFromString } = await import('uint8arrays/from-string');

    await pipe(
      [uint8ArrayFromString(raw + DELIMITER)],
      stream.sink,
    );
  }

  // receivePeerInfo receives peer info from the given stream
  private async receivePeerInfo(stream: Stream) {
    const { pipe } = await import('it-pipe');
    const { toString: uint8ArrayToString } = await import('uint8arrays/to-string');

    let raw: string = '';
    try {
      await pipe(
        stream.source,
        async (source) => {
          let temp: string = '';
          for await (const msg of source) {
            temp += uint8ArrayToString(msg.subarray());

            // TODO: Find a better way of doing this
            const delimiterIndex = temp.indexOf(DELIMITER);
            if (delimiterIndex !== -1) {
              raw = temp.slice(0, delimiterIndex);
              break;
            }
          }
        },
      );
    } catch (err) {
      this.checkError(err as Error);
    }

    // An EOF means the stream has been closed by the other side.
    // Check if 'raw' is empty in place of EOF error
    if (raw === '') {
      return;
    }

    let peerInfo;
    try {
      peerInfo = await parseBasicPeerInfo(raw);
    } catch (err) {
      this.checkError(err as Error);
    }
    assert(peerInfo);

    const [, foundPeer] = this.peers.loadOrStore(peerInfo.address, peerInfo);
    if (!foundPeer) {
      this.logger(`New peer found ${JSON.stringify(peerInfo)}`);

      // Use a non-blocking send in case no one is listening
      this.newPeerInfo.push(peerInfo);
    }
  }

  // Sends messages to other participants.
  // It blocks until the message is sent.
  // It will retry establishing a stream NUM_CONNECT_ATTEMPTS times before giving up
  async send(msg: Message) {
    let raw: string = '';
    try {
      raw = msg.serialize();
    } catch (err) {
      this.checkError(err as Error);
    }

    const [peerInfo, ok] = this.peers.load(msg.to);
    if (!ok) {
      throw new Error(`Could not load peer ${msg.to}`);
    }

    assert(peerInfo);
    assert(this.p2pHost);
    const { pipe } = await import('it-pipe');
    const { fromString: uint8ArrayFromString } = await import('uint8arrays/from-string');

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < NUM_CONNECT_ATTEMPTS; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const s = await this.p2pHost.dialProtocol(peerInfo.id, PROTOCOL_ID);

        // TODO: Implement buffered writer
        // writer := bufio.NewWriter(s)
        // // We don't care about the number of bytes written
        // _, err = writer.WriteString(raw + string(DELIMITER))
        // ms.checkError(err)
        // writer.Flush()
        // s.Close()

        // Use await on pipe in place of writer.Flush()
        await pipe(
          [uint8ArrayFromString(raw + DELIMITER)],
          s.sink,
        );
        s.close();

        return;
      } catch (err) {
        this.logger(`Attempt ${i} - Could not open stream to ${msg.to}`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, RETRY_SLEEP_DURATION); });
      }
    }
  }

  // checkError panics if the message service is running and there is an error, otherwise it just returns
  // eslint-disable-next-line n/handle-callback-err
  private checkError(err: Error) {
    throw err;
  }

  // out returns a channel that can be used to receive messages from the message service
  out(): ReadChannel<Message> {
    return this.toEngine.readOnly();
  }

  // Closes the P2PMessageService
  close(): void {
    // The mdns service is optional so we only close it if it exists
    // if s.mdns != nil {
    //   s.mdns.Close()
    // }

    this.p2pHost!.unhandle(PROTOCOL_ID);
    this.p2pHost!.stop();
  }

  // peerInfoReceived returns a channel that receives a PeerInfo when a peer is discovered
  peerInfoReceived(): ReadChannel<BasicPeerInfo> {
    return this.newPeerInfo.readOnly();
  }

  /* eslint-disable no-continue */
  // AddPeers adds the peers to the message service.
  // We ignore peers that are ourselves.
  async addPeers(peers: PeerInfo[]) {
    for (const [, p] of peers.entries()) {
      // Ignore ourselves
      if (p.address === this.me) {
        continue;
      }

      const { multiaddr } = await import('@multiformats/multiaddr');
      const multi = multiaddr(`/ip4/${p.ipAddress}/tcp/${p.port}/p2p/${p.id}`);
      await this.p2pHost!.peerStore.merge(
        p.id,
        {
          multiaddrs: [multi],
          // TODO: Check if ttl option exists to set it like in go-nitro
          // peerstore.PermanentAddrTTL
        },
      );
      this.peers.store(p.address, { id: p.id, address: p.address });
    }
  }
}

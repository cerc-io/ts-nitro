import assert from 'assert';
import debug from 'debug';
import { ethers } from 'ethers';
import { Buffer } from 'buffer';

import Channel from '@cerc-io/ts-channel';
import type { ReadChannel, ReadWriteChannel } from '@cerc-io/ts-channel';
// @ts-expect-error
import type { Libp2p } from '@cerc-io/libp2p';
// @ts-expect-error
import { PeerInitConfig } from '@cerc-io/peer';
// @ts-expect-error
import type { PrivateKey } from '@libp2p/interface-keys';
// @ts-expect-error
import type { Stream, Connection } from '@libp2p/interface-connection';
// @ts-expect-error
import type { IncomingStreamData } from '@libp2p/interface-registrar';
// @ts-expect-error
import type { PeerId } from '@libp2p/interface-peer-id';
// @ts-expect-error
import type { PeerProtocolsChangeData } from '@libp2p/interface-peer-store';
// @ts-expect-error
import { Multiaddr } from '@multiformats/multiaddr';

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
export interface BasicPeerInfo {
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
export interface PeerInfo {
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
}

// P2PMessageService is a rudimentary message service that uses TCP to send and receive messages.
export class BaseP2PMessageService implements MessageService {
  // For forwarding processed messages to the engine
  private toEngine?: ReadWriteChannel<Message>;

  private peers?: SafeSyncMap<BasicPeerInfo>;

  private me: Address = ethers.constants.AddressZero;

  private key?: PrivateKey;

  private p2pHost?: Libp2p;

  private newPeerInfo?: ReadWriteChannel<BasicPeerInfo>;

  private logger: debug.Debugger = log;

  // Custom channel storing ids of peers to whom self info has been sent
  private sentInfoToPeer = Channel<PeerId>(BUFFER_SIZE);

  constructor(params: ConstructorOptions) {
    Object.assign(this, params);
  }

  // newMessageService returns a running P2PMessageService listening on the given ip, port and message key.
  // If useMdnsPeerDiscovery is true, the message service will use mDNS to discover peers.
  // Otherwise, peers must be added manually via `AddPeers`.
  static async newMessageService(
    relayMultiAddr: string,
    me: Address,
    pk: Uint8Array,
    initOptions: PeerInitConfig = {},
    logWriter?: WritableStream,
  ): Promise<BaseP2PMessageService> {
    const ms = new BaseP2PMessageService({
      toEngine: Channel<Message>(BUFFER_SIZE),
      newPeerInfo: Channel<BasicPeerInfo>(BUFFER_SIZE),
      peers: new SafeSyncMap<BasicPeerInfo>(),
      me,
      logger: log,
    });

    const { unmarshalPrivateKey, marshalPrivateKey, marshalPublicKey } = await import('@libp2p/crypto/keys');

    try {
      const messageKey = await unmarshalPrivateKey(pk);
      ms.key = messageKey;
    } catch (err) {
      ms.checkError(err as Error);
    }

    assert(ms.key);
    const PeerIdFactory = await import('@libp2p/peer-id-factory');

    const { Peer } = await import('@cerc-io/peer');
    // TODO: Debug connection issue with webrtc enabled
    // Disabled by setting nodejs option to true below
    const peer = new Peer(relayMultiAddr, true);
    const peerId = await PeerIdFactory.createFromPrivKey(ms.key);

    await peer.init(
      initOptions,
      {
        id: peerId.toString(),
        privKey: Buffer.from(marshalPrivateKey(ms.key)).toString('base64'),
        pubKey: Buffer.from(marshalPublicKey(ms.key.public)).toString('base64'),
      },
    );

    assert(peer.node);
    ms.p2pHost = peer.node;
    assert(ms.p2pHost);
    ms.p2pHost.peerStore.addEventListener('change:protocols', ms.handlePeerProtocols.bind(ms));

    ms.p2pHost.handle(PROTOCOL_ID, ms.msgStreamHandler.bind(ms));

    ms.p2pHost.handle(PEER_EXCHANGE_PROTOCOL_ID, ({ stream }: IncomingStreamData) => {
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

  // handlePeerProtocols is called by the libp2p node when a peer protocols are updated.
  private async handlePeerProtocols({ detail: data }: CustomEvent<PeerProtocolsChangeData>) {
    assert(this.p2pHost);
    assert(this.p2pHost);

    // Ignore self protocol changes
    if (data.peerId.equals(this.p2pHost.peerId)) {
      return;
    }

    // Ignore if PEER_EXCHANGE_PROTOCOL_ID is not handled by remote peer
    if (!data.protocols.includes(PEER_EXCHANGE_PROTOCOL_ID)) {
      return;
    }

    try {
      const stream = await this.p2pHost.dialProtocol(
        data.peerId,
        PEER_EXCHANGE_PROTOCOL_ID,
      );

      await this.sendPeerInfo(stream);
      stream.close();

      // Use a non-blocking channel send in case no one is listening
      this.sentInfoToPeer.push(data.peerId);
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

    await this.toEngine!.push(m);
    stream.close();
  }

  // sendPeerInfo sends our peer info over the given stream
  private async sendPeerInfo(stream: Stream): Promise<void> {
    let raw: string = '';
    const peerId = await this.id();

    const peerInfo: BasicPeerInfo = {
      id: peerId,
      address: this.me,
    };

    try {
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

    const [, foundPeer] = this.peers!.loadOrStore(peerInfo.address, peerInfo);
    if (!foundPeer) {
      this.logger(`New peer found ${JSON.stringify(peerInfo)}`);

      // Use a non-blocking send in case no one is listening
      this.newPeerInfo!.push(peerInfo);
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

    const [peerInfo, ok] = this.peers!.load(msg.to);
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
    return this.toEngine!.readOnly();
  }

  // Closes the P2PMessageService
  close(): void {
    assert(this.p2pHost);

    this.p2pHost.unhandle(PROTOCOL_ID);
    this.p2pHost.stop();
  }

  // peerInfoReceived returns a channel that receives a PeerInfo when a peer is discovered
  peerInfoReceived(): ReadChannel<BasicPeerInfo> {
    return this.newPeerInfo!.readOnly();
  }

  /* eslint-disable no-continue */
  // AddPeers adds the peers to the message service.
  // We ignore peers that are ourselves.
  async addPeers(peers: PeerInfo[]) {
    assert(this.p2pHost);

    for (const [, p] of peers.entries()) {
      // Ignore ourselves
      if (p.address === this.me) {
        continue;
      }

      const { multiaddr } = await import('@multiformats/multiaddr');
      const multi = multiaddr(`/ip4/${p.ipAddress}/tcp/${p.port}/p2p/${p.id}`);

      await this.p2pHost.peerStore.addressBook.add(
        p.id,
        [multi],
        // TODO: Check if ttl option exists to set it like in go-nitro
        // peerstore.PermanentAddrTTL
      );
      this.peers!.store(p.address, { id: p.id, address: p.address });

      // Call custom method to send self info to remote peers so that they can send messages
      await this.connectAndSendPeerInfos(peers);
    }
  }

  // Custom method to add peer using multiaddr
  // Used for adding peers that support transports other than tcp
  async addPeerByMultiaddr(clientAddress: Address, multiaddr: Multiaddr) {
    // Ignore ourselves
    if (clientAddress === this.me) {
      return;
    }

    const peerIdString = multiaddr.getPeerId();
    assert(peerIdString);
    const { peerIdFromString } = await import('@libp2p/peer-id');
    const peerId = peerIdFromString(peerIdString);

    await this.p2pHost.peerStore.addressBook.add(
      peerId,
      [multiaddr],
    );

    this.peers!.store(clientAddress, { id: peerId, address: clientAddress });

    // Call custom method to send self info to remote peers so that they can send messages
    await this.connectAndSendPeerInfos([
      {
        id: peerId,
        address: clientAddress,
      },
    ]);
  }

  // Custom method to dial and connect to peers
  // It also waits for self to send info to remote peer
  // This method is only required by addPeers method to exchange peer info
  private async connectAndSendPeerInfos(peers: BasicPeerInfo[]) {
    const connectionPromises = peers.map(async (peerInfo) => {
      // Dial peer to connect and then trigger change:protocols event which would send peer info
      return this.p2pHost!.dial(peerInfo.id);
    });

    const connectionPromisesResult = await Promise.allSettled(connectionPromises);

    // Filter out only successfully connected peers
    let connections: Connection[] = connectionPromisesResult.filter((result, index) => {
      if (result.status === 'rejected') {
        this.logger(`Connection unsuccesful for ${peers[index].id}: ${result.reason}`);
      }

      return result.status === 'fulfilled';
    })
      .map((result) => (result as PromiseFulfilledResult<Connection>).value);

    // Wait for sending self info to all connected remote peers
    while (connections.length) {
      const peerId = await this.sentInfoToPeer.shift();
      connections = connections.filter((connection) => !peerId.equals(connection.remotePeer));
      this.logger(`Connected and sent info to peer ${peerId.toString()}`);
    }
  }
}

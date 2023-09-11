/* eslint-disable no-await-in-loop */

import assert from 'assert';
import debug from 'debug';
import { ethers } from 'ethers';

import Channel from '@cerc-io/ts-channel';
import type { ReadChannel, ReadWriteChannel } from '@cerc-io/ts-channel';
// @ts-expect-error
import type { Libp2p } from '@cerc-io/libp2p';
// @ts-expect-error
import type { PrivateKey } from '@libp2p/interface-keys';
// @ts-expect-error
import type { Stream, Connection } from '@libp2p/interface-connection';
// @ts-expect-error
import type { IncomingStreamData } from '@libp2p/interface-registrar';
// @ts-expect-error
import type { PeerId } from '@libp2p/interface-peer-id';
// @ts-expect-error
import { PeerProtocolsChangeData } from '@libp2p/interface-peer-store';
// @ts-expect-error
import type { Peer } from '@cerc-io/peer';

import { SafeSyncMap } from '../../../../internal/safesync/safesync';
import { Message, deserializeMessage } from '../../../../protocols/messages';
import { Address } from '../../../../types/types';
import { MessageService } from '../messageservice';

const log = debug('ts-nitro:p2p-message-service');

const GENERAL_MSG_PROTOCOL_ID = '/nitro/msg/1.0.0';
const PEER_EXCHANGE_PROTOCOL_ID = '/nitro/peerinfo/1.0.0';
const DELIMITER = '\n';
const BUFFER_SIZE = 1_000;
const NUM_CONNECT_ATTEMPTS = 10;
const RETRY_SLEEP_DURATION = 2.5 * 1000; // 2.5 seconds
const ERR_CONNECTION_BEING_CLOSED = 'the connection is being closed';
const ERR_PROTOCOL_FAIL = 'protocol selection failed';
const ERR_PEER_NOT_FOUND = 'peer info not found';
const ERR_PEER_DIAL_FAILED = 'peer dial failed';

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

interface ConstructorOptions {
  toEngine: ReadWriteChannel<Message>;
  peers: SafeSyncMap<PeerId>;
  me: Address;
  newPeerInfo: ReadWriteChannel<BasicPeerInfo>;
  logger: debug.Debugger;
  key?: PrivateKey;
  p2pHost?: Libp2p;
}

// P2PMessageService is a rudimentary message service that uses TCP to send and receive messages.
export class P2PMessageService implements MessageService {
  // For forwarding processed messages to the engine
  private toEngine?: ReadWriteChannel<Message>;

  private peers?: SafeSyncMap<PeerId>;

  private me: Address = ethers.constants.AddressZero;

  private key?: PrivateKey;

  private p2pHost?: Libp2p;

  private newPeerInfo?: ReadWriteChannel<BasicPeerInfo>;

  private logger: debug.Debugger = log;

  // Custom channel storing ids of peers to whom self info has been sent
  private sentInfoToPeer = Channel<PeerId>(BUFFER_SIZE);

  private peer?: Peer;

  constructor(params: ConstructorOptions) {
    Object.assign(this, params);
  }

  // newMessageService returns a running P2PMessageService listening on the given ip, port and message key.
  static async newMessageService(
    me: Address,
    peer: Peer,
    logWriter?: WritableStream,
  ): Promise<P2PMessageService> {
    const ms = new P2PMessageService({
      toEngine: Channel<Message>(BUFFER_SIZE),
      newPeerInfo: Channel<BasicPeerInfo>(BUFFER_SIZE),
      peers: new SafeSyncMap<PeerId>(),
      me,
      logger: log,
    });

    ms.peer = peer;
    assert(ms.peer.peerId);
    const { unmarshalPrivateKey } = await import('@libp2p/crypto/keys');

    const messageKey = await unmarshalPrivateKey(ms.peer.peerId.privateKey!);
    ms.key = messageKey;

    assert(ms.peer.node);
    ms.p2pHost = ms.peer.node;
    assert(ms.p2pHost);
    ms.p2pHost.addEventListener('peer:connect', ms.handlePeerConnect.bind(ms));
    ms.p2pHost.peerStore.addEventListener('change:protocols', ms.handleChangeProtocols.bind(ms));

    ms.p2pHost.handle(GENERAL_MSG_PROTOCOL_ID, ms.msgStreamHandler.bind(ms));
    ms.p2pHost.handle(PEER_EXCHANGE_PROTOCOL_ID, ms.receivePeerInfo.bind(ms));

    await ms.exchangeInfoWithConnectedPeers();

    return ms;
  }

  // id returns the libp2p peer ID of the message service.
  async id(): Promise<PeerId> {
    const PeerIdFactory = await import('@libp2p/peer-id-factory');

    assert(this.key);
    return PeerIdFactory.createFromPrivKey(this.key);
  }

  // Custom Method to exchange info with already connected peers
  private async exchangeInfoWithConnectedPeers() {
    const peerIds = this.p2pHost.getPeers();

    await Promise.all(peerIds.map(async (peerId: PeerId) => {
      const connection: Connection = await this.p2pHost.dial(peerId);

      await this.handlePeerConnect({ detail: connection } as CustomEvent<Connection>);
    }));
  }

  // handleChangeProtocols is called by the libp2p node when a peer changes protocol.
  // This is similar to HandlePeerFound method in go-nitro, which has been now removed
  // https://github.com/statechannels/go-nitro/pull/1534/
  private async handleChangeProtocols({ detail: data }: CustomEvent<PeerProtocolsChangeData>) {
    // Ignore self protocol changes
    if (data.peerId.equals(this.p2pHost.peerId)) {
      return;
    }

    // Ignore if PEER_EXCHANGE_PROTOCOL_ID is not handled by remote peer
    if (!data.protocols.includes(PEER_EXCHANGE_PROTOCOL_ID)) {
      return;
    }

    // Returns existing connection
    await this.exchangePeerInfo(data.peerId);
  }

  // handlePeerConnect is called by the libp2p node when a peer gets connected.
  // This is similar to HandlePeerFound method in go-nitro, which has been now removed
  // https://github.com/statechannels/go-nitro/pull/1534/
  private async handlePeerConnect({ detail: data }: CustomEvent<Connection>) {
    assert(this.p2pHost);

    // Get protocols supported by remote peer
    const protocols = await this.p2pHost.peerStore.protoBook.get(data.remotePeer);

    // The protocol may not be updated in the list and will be handled later on change:protocols event
    if (!protocols.includes(PEER_EXCHANGE_PROTOCOL_ID)) {
      return;
    }

    await this.exchangePeerInfo(data.remotePeer);
  }

  // Custom method to exchange peer info
  // Method is called by handleChangeProtocols and handlePeerConnect
  private async exchangePeerInfo(peerId: PeerId) {
    for (let i = 0; i < NUM_CONNECT_ATTEMPTS; i += 1) {
      try {
        await this.sendPeerInfo(peerId);

        // Use a non-blocking channel send in case no one is listening
        this.sentInfoToPeer.push(peerId);
        return;
      } catch (err) {
        const dialError = (err as Error);

        // Return if the connection is in closing state OR
        // The peer doesn't support the peer info protocol
        // (expected if the peer is not setup with a nitro client yet)
        if (dialError.message.includes(ERR_CONNECTION_BEING_CLOSED) || dialError.message.includes(ERR_PROTOCOL_FAIL)) {
          log(dialError.message);
          return;
        }

        this.logger(`Attempt ${i} - Could not exchange peer info with ${peerId.toString()}: ${dialError}`);
        await new Promise((resolve) => { setTimeout(resolve, RETRY_SLEEP_DURATION); });
      }
    }
  }

  private async msgStreamHandler({ stream }: IncomingStreamData) {
    let deferStreamClose;
    try {
      deferStreamClose = () => {
        stream.close();
      };
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

              const delimiterIndex = temp.indexOf(DELIMITER);
              if (delimiterIndex !== -1) {
                raw = temp.slice(0, delimiterIndex);
                break;
              }
            }
          },
        );
      } catch (err) {
        this.logger(err);
        return;
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
        this.logger(err);
        return;
      }
      assert(m);

      await this.toEngine!.push(m);
    } finally {
      if (deferStreamClose) {
        deferStreamClose();
      }
    }
  }

  // sendPeerInfo sends our peer info over the given stream
  // Triggered whenever node establishes a connection with a peer
  // This is similar to SendPeerInfo method in go-nitro, which has been now removed
  // https://github.com/statechannels/go-nitro/pull/1534/
  private async sendPeerInfo(recipientId: PeerId): Promise<void> {
    let deferSreamClose;
    let stream: Stream;
    try {
      try {
        stream = await this.p2pHost.dialProtocol(recipientId, PEER_EXCHANGE_PROTOCOL_ID);
      } catch (err) {
        this.logger({
          error: err,
          message: `failed to create stream for passing peerInfo with ${recipientId.toString()}`,
        });
        return;
      }

      deferSreamClose = () => {
        stream.close();
      };

      let raw: string = '';
      const peerId = await this.id();
      const basicPeerInfo: BasicPeerInfo = {
        id: peerId,
        address: this.me,
      };

      try {
        raw = JSON.stringify(basicPeerInfo);
      } catch (err) {
        this.logger(err);
        return;
      }
      const { pipe } = await import('it-pipe');
      const { fromString: uint8ArrayFromString } = await import('uint8arrays/from-string');

      try {
        await pipe(
          [uint8ArrayFromString(raw + DELIMITER)],
          stream!.sink,
        );
      } catch (err) {
        this.logger(err);
        return;
      }
    } finally {
      if (deferSreamClose) {
        deferSreamClose();
      }
    }
  }

  // receivePeerInfo receives peer info from the given stream
  // This is similar to ReceivePeerInfo method in go-nitro, which has been now removed
  // https://github.com/statechannels/go-nitro/pull/1534/
  private async receivePeerInfo({ stream }: IncomingStreamData) {
    let deferStreamClose;
    try {
      const { pipe } = await import('it-pipe');
      const { toString: uint8ArrayToString } = await import('uint8arrays/to-string');

      this.logger('received peerInfo');
      deferStreamClose = () => {
        stream.close();
      };

      let raw: string = '';
      try {
        await pipe(
          stream.source,
          async (source) => {
            let temp: string = '';
            for await (const msg of source) {
              temp += uint8ArrayToString(msg.subarray());

              const delimiterIndex = temp.indexOf(DELIMITER);
              if (delimiterIndex !== -1) {
                raw = temp.slice(0, delimiterIndex);
                break;
              }
            }
          },
        );
      } catch (err) {
        this.logger(err);
        return;
      }

      // An EOF means the stream has been closed by the other side.
      // Check if 'raw' is empty in place of EOF error
      if (raw === '') {
        return;
      }

      let msg: BasicPeerInfo;
      try {
        msg = await parseBasicPeerInfo(raw);
      } catch (err) {
        this.logger(err);
        return;
      }

      const [, foundPeer] = this.peers!.loadOrStore(msg!.address.toString(), msg!.id);
      if (!foundPeer) {
        const peerInfo: BasicPeerInfo = {
          id: msg!.id,
          address: msg!.address,
        };

        this.logger(`stored new peer in map: ${JSON.stringify(peerInfo)}`);

        // Use a non-blocking send in case no one is listening
        this.newPeerInfo!.push(peerInfo);
      }
    } finally {
      if (deferStreamClose) {
        deferStreamClose();
      }
    }
  }

  // Sends messages to other participants.
  // It blocks until the message is sent.
  // It will retry establishing a stream NUM_CONNECT_ATTEMPTS times before giving up
  async send(msg: Message) {
    let raw: string = '';
    raw = msg.serialize();

    const [peerId, ok] = this.peers!.load(msg.to);
    if (!ok) {
      throw new Error(`Could not load peer ${msg.to}`);
    }

    assert(peerId);
    assert(this.p2pHost);
    const { pipe } = await import('it-pipe');
    const { fromString: uint8ArrayFromString } = await import('uint8arrays/from-string');

    for (let i = 0; i < NUM_CONNECT_ATTEMPTS; i += 1) {
      try {
        const s = await this.p2pHost.dialProtocol(peerId, GENERAL_MSG_PROTOCOL_ID);

        // Use await on pipe in place of writer.Flush()
        await pipe(
          [uint8ArrayFromString(raw + DELIMITER)],
          s.sink,
        );
        s.close();

        return;
      } catch (err) {
        this.logger(`Attempt ${i} - could not open stream to ${msg.to}: ${err}`);
        await new Promise((resolve) => { setTimeout(resolve, RETRY_SLEEP_DURATION); });
      }
    }
  }

  // checkError panics if the message service is running and there is an error, otherwise it just returns
  private checkError(err: Error) {
    throw err;
  }

  // out returns a channel that can be used to receive messages from the message service
  out(): ReadChannel<Message> {
    return this.toEngine!.readOnly();
  }

  // Closes the P2PMessageService
  async close(): Promise<void> {
    assert(this.p2pHost);

    await this.peer?.close();
    await this.p2pHost.unhandle(GENERAL_MSG_PROTOCOL_ID);
    await this.p2pHost.stop();
  }

  // peerInfoReceived returns a channel that receives a PeerInfo when a peer is discovered
  peerInfoReceived(): ReadChannel<BasicPeerInfo> {
    return this.newPeerInfo!.readOnly();
  }

  // Custom method to add peer using multiaddr
  // Used for adding peers that support transports other than tcp
  async addPeerByMultiaddr(clientAddress: Address, multiaddrString: string) {
    // Ignore ourselves
    if (clientAddress === this.me) {
      return;
    }

    const { multiaddr } = await import('@multiformats/multiaddr');
    const multi = multiaddr(multiaddrString);

    const peerIdString = multi.getPeerId();
    assert(peerIdString);
    const { peerIdFromString } = await import('@libp2p/peer-id');
    const peerId = peerIdFromString(peerIdString);

    await this.p2pHost.peerStore.addressBook.add(
      peerId,
      [multi],
    );

    this.peers!.store(clientAddress, peerId);

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

      // Filter and log message for peers that are sent info by connecting manually
      if (peers.some((basicPeerInfo) => basicPeerInfo.id.equals(peerId))) {
        this.logger(`Connected and sent info to peer ${peerId.toString()}`);
      }
    }
  }

  // Custom method to check if a peer is known and dialable
  async isPeerDialable(peerAddress: string): Promise<[boolean, string]> {
    assert(this.peers);

    // Try to load peer from the peers info map
    const [peerId, foundPeer] = this.peers.load(peerAddress);
    if (!foundPeer) {
      return [false, ERR_PEER_NOT_FOUND];
    }
    assert(peerId);

    try {
      await this.p2pHost.dial(peerId);
    } catch (err) {
      return [false, ERR_PEER_DIAL_FAILED];
    }

    return [true, ''];
  }
}

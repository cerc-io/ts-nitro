import debug from 'debug';
import assert from 'assert';
import { ethers } from 'ethers';

import type { ReadWriteChannel } from '@nodeguy/channel';
import { randUint64 } from '@cerc-io/nitro-util';

import { MessageService } from './engine/messageservice/messageservice';
import { ChainService } from './engine/chainservice/chainservice';
import { Store } from './engine/store/store';
import { PolicyMaker } from './engine/policy-maker';
import { VoucherManager } from '../payments/voucher-manager';
import { Engine } from './engine/engine';
import { Address } from '../types/types';
import { ChannelNotifier } from './notifier/channel-notifier';
import { ObjectiveId } from '../protocols/messages';
import { SyncMap } from '../internal/safesync/safesync';
import { Voucher } from '../payments/vouchers';
import { MetricsApi } from './engine/metrics';
import { Exit } from '../channel/state/outcome/exit';
import {
  ObjectiveResponse as DirectFundObjectiveResponse,
  ObjectiveRequest as DirectFundObjectiveRequest,
} from '../protocols/directfund/directfund';

const log = debug('ts-nitro:client');

export class Client {
  // The core business logic of the client
  private engine?: Engine;

  address?: Address;

  private channelNotifier?: ChannelNotifier;

  private completedObjectivesForRPC?: ReadWriteChannel<ObjectiveId>;

  private completedObjectives?: SyncMap<ReadWriteChannel<null>>;

  private failedObjectives?: ReadWriteChannel<ObjectiveId>;

  private receivedVouchers?: ReadWriteChannel<Voucher>;

  private chainId?: bigint;

  private store?: Store;

  private vm?: VoucherManager;

  private logger?: debug.Debugger;

  static async new(
    messageService: MessageService,
    chainservice: ChainService,
    store: Store,
    logDestination: WritableStream,
    policymaker: PolicyMaker,
    metricsApi: MetricsApi,
  ): Promise<Client> {
    // TODO: Port over implementation
    const client = new Client();

    client.address = store.getAddress();
    client.chainId = await chainservice.getChainId();
    client.vm = new VoucherManager(ethers.constants.AddressZero, store);

    client.engine = new Engine(client.vm, messageService, chainservice, store, policymaker);

    return client;
  }

  // CreateLedgerChannel creates a directly funded ledger channel with the given counterparty.
  // The channel will run under full consensus rules (it is not possible to provide a custom AppDefinition or AppData).
  // TODO: uint32 replacement
  createLedgerChannel(counterparty: Address, challengeDuration: number, outcome: Exit): DirectFundObjectiveResponse {
    assert(this.engine);
    assert(this.address);
    assert(this.chainId);

    const objectiveRequest = new DirectFundObjectiveRequest(
      counterparty,
      challengeDuration,
      outcome,
      randUint64(),
      this.engine.getConsensusAppAddress(),
    );

    // Send the event to the engine
    this.engine.objectiveRequestsFromAPI.push(objectiveRequest);
    objectiveRequest.waitForObjectiveToStart();
    return objectiveRequest.response(this.address, this.chainId);
  }
}

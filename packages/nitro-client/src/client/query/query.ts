import { Exit } from '../../channel/state/outcome/exit';
import { Channel } from '../../channel/channel';
import { State } from '../../channel/state/state';
import { VoucherManager } from '../../payments/voucher-manager';
import { Destination } from '../../types/destination';
import { Address } from '../../types/types';
import {
  ChannelStatus, LedgerChannelBalance, LedgerChannelInfo, PaymentChannelInfo, PaymentChannelBalance,
} from './types';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import { Store, ErrNoSuchChannel } from '../engine/store/store';

const getStatusFromChannel = (c: Channel): ChannelStatus => {
  if (c.finalSignedByMe()) {
    if (c.finalCompleted()) {
      return ChannelStatus.Complete;
    }
    return ChannelStatus.Closing;
  }

  if (!c.postFundComplete()) {
    return ChannelStatus.Proposed;
  }
  return ChannelStatus.Open;
};

const getPaymentChannelBalance = (participants: Address[] | null, outcome: Exit): PaymentChannelBalance => {
  const numParticipants = participants!.length;
  // TODO: We assume single asset outcomes
  const sao = outcome.value![0];
  const { asset } = sao;
  const payer = participants![0];
  const payee = participants![numParticipants - 1];
  const paidSoFar = BigInt(sao.allocations.value![1].amount!);
  const remaining = BigInt(sao.allocations.value![0].amount!);
  return new PaymentChannelBalance({
    assetAddress: asset,
    payer,
    payee,
    paidSoFar,
    remainingFunds: remaining,
  });
};

const getLedgerBalanceFromState = (latest: State): LedgerChannelBalance => {
  // TODO: We assume single asset outcomes
  const outcome = latest.outcome.value![0];
  const { asset } = outcome;
  const client = latest.participants![0];
  const clientBalance = BigInt(outcome.allocations.value![0].amount!);
  const hub = latest.participants![1];
  const hubBalance = BigInt(outcome.allocations.value![1].amount!);

  return new LedgerChannelBalance({
    assetAddress: asset,
    hub,
    client,
    hubBalance,
    clientBalance,
  });
};

const getLatestSupportedOrPreFund = (channel: Channel): State => {
  if (channel.hasSupportedState()) {
    return channel.latestSupportedState();
  }

  return channel.preFundState();
};

export const getVoucherBalance = async (id: Destination, vm: VoucherManager): Promise<[bigint | undefined, bigint | undefined]> => {
  let paid: bigint | undefined = BigInt(0);
  let remaining: bigint | undefined = BigInt(0);

  if (!(await vm.channelRegistered(id))) {
    return [paid, remaining];
  }

  paid = await vm.paid(id);
  remaining = await vm.remaining(id);

  return [paid, remaining];
};

export const constructPaymentInfo = (c: Channel, paid?: bigint, remaining?: bigint): PaymentChannelInfo => {
  let status = getStatusFromChannel(c);

  // ADR 0009 allows for intermediaries to exit the protocol before receiving all signed post funds
  // So for intermediaries we return Open once they have signed their post fund state
  const amIntermediary: boolean = Number(c.myIndex) !== 0 && Number(c.myIndex) !== (c.participants ?? []).length - 1;
  if (amIntermediary && c.postFundSignedByMe()) {
    status = ChannelStatus.Open;
  }

  const latest = getLatestSupportedOrPreFund(c);
  const balance = getPaymentChannelBalance(c.participants, latest.outcome);

  balance.paidSoFar = paid;

  balance.remainingFunds = remaining;

  return new PaymentChannelInfo({
    iD: c.id,
    status,
    balance,
  });
};

// GetPaymentChannelInfo returns the PaymentChannelInfo for the given channel
// It does this by querying the provided store and voucher manager
export const getPaymentChannelInfo = async (id: Destination, store: Store, vm: VoucherManager): Promise<PaymentChannelInfo> => {
  const [c, channelFound] = await store.getChannelById(id);

  if (channelFound) {
    const [paid, remaining] = await getVoucherBalance(id, vm);

    return constructPaymentInfo(c, paid, remaining);
  }

  throw new Error(`Could not find channel with id ${id}`);
};

export const constructLedgerInfoFromConsensus = (con: ConsensusChannel): LedgerChannelInfo => {
  const latest = con.consensusVars().asState(con.fixedPart());
  return new LedgerChannelInfo({
    iD: con.id,
    status: ChannelStatus.Open,
    balance: getLedgerBalanceFromState(latest),
  });
};

export const constructLedgerInfoFromChannel = (c: Channel): LedgerChannelInfo => {
  const latest = getLatestSupportedOrPreFund(c);

  return new LedgerChannelInfo({
    iD: c.id,
    status: getStatusFromChannel(c),
    balance: getLedgerBalanceFromState(latest),
  });
};

// GetAllLedgerChannels returns a `LedgerChannelInfo` for each ledger channel in the store.
export const getAllLedgerChannels = async (store: Store, consensusAppDefinition: Address): Promise<LedgerChannelInfo[]> => {
  const toReturn: LedgerChannelInfo[] = [];
  const allConsensus = await store.getAllConsensusChannels();

  for (const con of allConsensus) {
    toReturn.push(constructLedgerInfoFromConsensus(con));
  }

  const allChannels = await store.getChannelsByAppDefinition(consensusAppDefinition);

  for (const c of allChannels) {
    const l = constructLedgerInfoFromChannel(c);
    toReturn.push(l);
  }

  return toReturn;
};

// GetPaymentChannelsByLedger returns a `PaymentChannelInfo` for each active payment channel funded by the given ledger channel.
export const getPaymentChannelsByLedger = async (ledgerId: Destination, s: Store, vm: VoucherManager): Promise<PaymentChannelInfo[]> => {
  // If a ledger channel is actively funding payment channels it must be in the form of a consensus channel
  let con: ConsensusChannel;
  try {
    // If the ledger channel is not a consensus channel we know that there are no payment channels funded by it
    con = await s.getConsensusChannelById(ledgerId);
  } catch (err) {
    if ((err as Error).message.includes(ErrNoSuchChannel.message)) {
      return [];
    }

    throw new Error(`could not find any payment channels funded by ${ledgerId}: ${err}`);
  }

  const toQuery = con.consensusVars().outcome.fundingTargets();

  let paymentChannels: Channel[];

  try {
    paymentChannels = await s.getChannelsByIds(toQuery);
  } catch (err) {
    throw new Error(`could not query the store about ids ${toQuery}: ${err}`);
  }

  const toReturn: PaymentChannelInfo[] = [];

  for await (const p of paymentChannels) {
    const [paid, remaining] = await getVoucherBalance(p.id, vm);
    const info = constructPaymentInfo(p, paid, remaining);
    toReturn.push(info);
  }

  return toReturn;
};

// GetLedgerChannelInfo returns the LedgerChannelInfo for the given channel
// It does this by querying the provided store
export const getLedgerChannelInfo = async (id: Destination, store: Store): Promise<LedgerChannelInfo> => {
  const [c, ok] = await store.getChannelById(id);
  if (ok) {
    return constructLedgerInfoFromChannel(c);
  }

  const con = await store.getConsensusChannelById(id)!;
  return constructLedgerInfoFromConsensus(con);
};

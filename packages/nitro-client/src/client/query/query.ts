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
import { Store } from '../engine/store/store';

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

const getPaymentChannelBalance = (participants: Address[], outcome: Exit): PaymentChannelBalance => {
  const numParticipants = participants.length;
  // TODO: We assume single asset outcomes
  const sao = outcome.value[0];
  const { asset } = sao;
  const payer = participants[0];
  const payee = participants[numParticipants - 1];
  const paidSoFar = BigInt(sao.allocations[1].amount);
  const remaining = BigInt(sao.allocations[0].amount);
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
  const outcome = latest.outcome.value[0];
  const { asset } = outcome;
  const client = latest.participants[0];
  const clientBalance = BigInt(outcome.allocations[0].amount);
  const hub = latest.participants[1];
  const hubBalance = BigInt(outcome.allocations[1].amount);

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

export const getVoucherBalance = (id: Destination, vm: VoucherManager): [bigint, bigint] => {
  let paid: bigint = BigInt(0);
  let remaining: bigint = BigInt(0);

  if (!vm.channelRegistered(id)) {
    return [paid, remaining];
  }

  paid = vm.paid(id);
  remaining = vm.remaining(id);

  return [paid, remaining];
};

export const constructPaymentInfo = (c: Channel, paid: bigint, remaining: bigint): PaymentChannelInfo => {
  let status = getStatusFromChannel(c);

  // ADR 0009 allows for intermediaries to exit the protocol before receiving all signed post funds
  // So for intermediaries we return Open once they have signed their post fund state
  const amIntermediary: boolean = c.myIndex !== 0 && c.myIndex !== c.participants.length - 1;
  if (amIntermediary && c.postFundSignedByMe()) {
    status = ChannelStatus.Open;
  }

  const latest = getLatestSupportedOrPreFund(c);
  const balance = getPaymentChannelBalance(c.participants, latest.outcome);

  balance.paidSoFar = BigInt(paid);

  balance.remainingFunds = BigInt(remaining);

  return new PaymentChannelInfo({
    iD: c.id,
    status,
    balance,
  });
};

// GetPaymentChannelInfo returns the PaymentChannelInfo for the given channel
// It does this by querying the provided store and voucher manager
export const getPaymentChannelInfo = (id: Destination, store: Store, vm: VoucherManager): PaymentChannelInfo => {
  const [c, channelFound] = store.getChannelById(id);

  if (channelFound) {
    const [paid, remaining] = getVoucherBalance(id, vm);

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

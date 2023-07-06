import { Buffer } from 'buffer';

import { Allocations } from '../../../../channel/state/outcome/allocation';
import { AssetMetadata, Exit } from '../../../../channel/state/outcome/exit';
import { FixedPart, VariablePart } from '../../../../channel/state/state';
import { Signature } from '../../../../crypto/signatures';
import {
  ExitFormat, INitroTypes,
} from './nitro-adjudicator';

export function convertAssetMetadata(am: AssetMetadata): ExitFormat.AssetMetadataStruct {
  return {
    assetType: am.assetType,
    metadata: am.metadata ?? Buffer.alloc(0),
  };
}

export function convertAllocations(as: Allocations): ExitFormat.AllocationStruct[] {
  return (as.value ?? []).map((a): ExitFormat.AllocationStruct => ({
    destination: a.destination.value,
    amount: a.amount!,
    allocationType: a.allocationType,
    metadata: a.metadata ?? Buffer.alloc(0),
  }));
}

export function convertOutcome(o: Exit): ExitFormat.SingleAssetExitStruct[] {
  return (o.value ?? []).map((sae) => ({
    asset: sae.asset,
    assetMetadata: convertAssetMetadata(sae.assetMetadata!),
    allocations: convertAllocations(sae.allocations),
  }));
}

export function convertFixedPart(fp: FixedPart): INitroTypes.FixedPartStruct {
  return {
    participants: fp.participants ?? [],
    channelNonce: fp.channelNonce,
    appDefinition: fp.appDefinition,
    challengeDuration: BigInt(fp.challengeDuration),
  };
}

export function convertVariablePart(vp: VariablePart): INitroTypes.VariablePartStruct {
  return {
    appData: vp.appData ?? Buffer.alloc(0),
    turnNum: BigInt(vp.turnNum),
    isFinal: vp.isFinal,
    outcome: convertOutcome(vp.outcome!),
  };
}

export function convertSignature(s: Signature): INitroTypes.SignatureStruct {
  const sig = {
    v: s.v,
    r: Buffer.alloc(32),
    s: Buffer.alloc(32), // TODO we should just use 32 byte types, which would remove the need for this function
  };

  (s.r ?? Buffer.alloc(0)).copy(sig.r);
  (s.s ?? Buffer.alloc(0)).copy(sig.s);

  return sig;
}

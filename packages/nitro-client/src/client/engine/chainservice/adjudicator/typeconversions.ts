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
    metadata: am.metadata,
  };
}

export function convertAllocations(as: Allocations): ExitFormat.AllocationStruct[] {
  return as.value.map((a): ExitFormat.AllocationStruct => ({
    destination: a.destination.value,
    amount: a.amount,
    allocationType: a.allocationType,
    metadata: a.metadata,
  }));
}

export function convertOutcome(o: Exit): ExitFormat.SingleAssetExitStruct[] {
  return o.value.map((sae) => ({
    asset: sae.asset,
    assetMetadata: convertAssetMetadata(sae.assetMetadata!),
    allocations: convertAllocations(sae.allocations),
  }));
}

export function convertFixedPart(fp: FixedPart): INitroTypes.FixedPartStruct {
  return {
    participants: fp.participants,
    channelNonce: fp.channelNonce,
    appDefinition: fp.appDefinition,
    challengeDuration: BigInt(fp.challengeDuration),
  };
}

export function convertVariablePart(vp: VariablePart): INitroTypes.VariablePartStruct {
  return {
    appData: vp.appData,
    turnNum: BigInt(vp.turnNum),
    isFinal: vp.isFinal,
    outcome: convertOutcome(vp.outcome!),
  };
}

export function convertSignature(s: Signature): INitroTypes.SignatureStruct {
  const sig = {
    v: s.v,
    r: s.r.slice(0, 32),
    s: s.s.slice(0, 32), // TODO we should just use 32 byte types, which would remove the need for this function
  };

  return sig;
}

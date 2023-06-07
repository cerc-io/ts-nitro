import { Allocations } from '../../../../channel/state/outcome/allocation';
import { AssetMetadata, Exit } from '../../../../channel/state/outcome/exit';
import { FixedPart, VariablePart } from '../../../../channel/state/state';
import { Signature } from '../../../../crypto/signatures';
import {
  ExitFormatAllocation, ExitFormatAssetMetadata, ExitFormatSingleAssetExit, INitroTypesFixedPart, INitroTypesSignature, INitroTypesVariablePart,
} from './nitro-adjudicator';

export function convertAssetMetadata(am: AssetMetadata): ExitFormatAssetMetadata {
  return {
    assetType: am.assetType,
    metadata: am.metadata,
  };
}

export function convertAllocations(as: Allocations): ExitFormatAllocation[] {
  return as.value.map((a): ExitFormatAllocation => ({
    destination: a.destination.value,
    amount: a.amount,
    allocationType: a.allocationType,
    metadata: a.metadata,
  }));
}

export function convertOutcome(o: Exit): ExitFormatSingleAssetExit[] {
  return o.value.map((sae) => ({
    asset: sae.asset,
    assetMetadata: convertAssetMetadata(sae.assetMetadata!),
    allocations: convertAllocations(sae.allocations),
  }));
}

export function convertFixedPart(fp: FixedPart): INitroTypesFixedPart {
  return {
    participants: fp.participants,
    channelNonce: fp.channelNonce,
    appDefinition: fp.appDefinition,
    challengeDuration: BigInt(fp.challengeDuration),
  };
}

export function convertVariablePart(vp: VariablePart): INitroTypesVariablePart {
  return {
    appData: vp.appData,
    turnNum: BigInt(vp.turnNum),
    isFinal: vp.isFinal,
    outcome: convertOutcome(vp.outcome!),
  };
}

export function convertSignature(s: Signature): INitroTypesSignature {
  // TODO: Implement
  return s;
}

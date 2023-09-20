import { Destination } from '../../../../types/destination';
import { Allocation, Allocations } from '../../../../channel/state/outcome/allocation';
import { Exit, SingleAssetExit } from '../../../../channel/state/outcome/exit';
import { Signature } from '../../../../crypto/signatures';
import { ExitFormat, INitroTypes } from './nitro-adjudicator';

function convertBindingsAllocationsToAllocations(as: ExitFormat.AllocationStruct[]): Allocations {
  const allocations: Allocation[] = [];
  for (let i = 0; i < as.length; i += 1) {
    const a = as[i];
    allocations.push(new Allocation({
      destination: new Destination(a.destination.toString()),
      amount: BigInt(a.amount.toString()),
      metadata: Buffer.from(a.metadata.toString()),
      allocationType: Number(a.allocationType),
    }));
  }

  return new Allocations(allocations);
}

function convertBindingsSingleAssetExitToSingleAssetExit(e: ExitFormat.SingleAssetExitStruct): SingleAssetExit {
  return new SingleAssetExit({
    asset: e.asset,
    assetMetadata: {
      assetType: Number(e.assetMetadata.assetType),
      metadata: Buffer.from(e.assetMetadata.metadata.toString()),
    },
    allocations: convertBindingsAllocationsToAllocations(e.allocations),
  });
}

// ConvertBindingsExitToExit converts the exit type returned from abigen bindings to an outcome.Exit
export function convertBindingsExitToExit(e: ExitFormat.SingleAssetExitStruct[]): Exit {
  const exit: SingleAssetExit[] = [];
  for (let i = 0; i < e.length; i += 1) {
    const sae = e[i];
    exit.push(convertBindingsSingleAssetExitToSingleAssetExit(sae));
  }

  return new Exit(exit);
}

// ConvertBindingsSignatureToSignature converts the signature type returned from abigien bindings to a state.Signature
function convertBindingsSignatureToSignature(s: INitroTypes.SignatureStruct): Signature {
  return new Signature({
    r: Buffer.from(s.r.toString()),
    s: Buffer.from(s.s.toString()),
    v: Number(s.v),
  });
}

// ConvertBindingsSignatureToSignature converts a slice of the signature type returned from abigien bindings to a []state.Signature
export function convertBindingsSignaturesToSignatures(ss: INitroTypes.SignatureStruct[]): Signature[] {
  const sigs: Signature[] = [];
  for (let i = 0; i < ss.length; i += 1) {
    const s = ss[i];
    sigs.push(convertBindingsSignatureToSignature(s));
  }

  return sigs;
}

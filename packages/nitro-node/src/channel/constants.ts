import { Uint64 } from '@cerc-nitro/nitro-util';

// MaxTurnNum is a reserved value which is taken to mean "there is not yet a supported state"
export const MaxTurnNum: Uint64 = BigInt(2 ** 64) - BigInt(1);

export const PreFundTurnNum: Uint64 = BigInt(0);
export const PostFundTurnNum: Uint64 = BigInt(1);

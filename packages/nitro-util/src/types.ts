import JSONbig from 'json-bigint';

export const JSONbigNative = JSONbig({ useNativeBigInt: true });

export type Uint = bigint;
export type Uint64 = bigint;

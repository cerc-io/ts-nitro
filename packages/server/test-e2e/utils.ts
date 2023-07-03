import { GetMetrics } from '@cerc-io/nitro-client';

export function getMetricsKey(arr: string[], address: string): string[] {
  return arr.map((element) => `${element},wallet=${address}`);
}

export function getMetricsMessageObj(obj: GetMetrics, fromAddress: string, toAddress: string): GetMetrics {
  const newObj: GetMetrics = {};
  /* eslint-disable no-restricted-syntax */
  /* eslint-disable guard-for-in */
  for (const key in obj) {
    const newKey = `${key},sender=${fromAddress},receiver=${toAddress},wallet=${fromAddress}`;
    newObj[newKey] = obj[key];
  }
  return newObj;
}

export function getMetricsMessage(key: string, fromAddress: string, toAddress: string): string {
  return `${key},sender=${fromAddress},receiver=${toAddress},wallet=${fromAddress}`;
}

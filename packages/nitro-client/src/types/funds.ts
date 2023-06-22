import {
  FieldDescription, JSONbigNative, decodeMap, encodeMap,
} from '@cerc-io/nitro-util';

import { Address } from './types';

// A {tokenAddress: amount} map. Address 0 represents a chain's native token (ETH, FIL, etc)
export class Funds {
  // Access using value property
  value: Map<Address, bigint>;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    value: { type: 'map', key: { type: 'string' }, value: { type: 'bigint' } },
  };

  static fromJSON(data: string): Funds {
    // jsonValue has the value for 'value' map
    const jsonValue = JSONbigNative.parse(data);
    const value = decodeMap(Funds.jsonEncodingMap.value.key!, Funds.jsonEncodingMap.value.value, jsonValue);
    return new Funds(value);
  }

  toJSON(): any {
    // Return serialized map value
    // (Funds is a map in go-nitro)
    return encodeMap(Funds.jsonEncodingMap.value.value, this.value);
  }

  constructor(value: Map<Address, bigint> = new Map()) {
    this.value = value;
  }

  // isNonZero returns true if the Holdings structure has any non-zero asset
  isNonZero(): boolean {
    for (const [asset, amount] of this.value.entries()) {
      if (amount > BigInt(0)) {
        return true;
      }
    }

    return false;
  }

  // String returns a bracket-separaged list of assets: {[0x0a,0x01][0x0b,0x01]}
  string(): string {
    if (this.value.size === 0) {
      return '{}';
    }

    let s: string = '{';
    for (const [asset, amount] of this.value.entries()) {
      s += `[${asset},${amount.toString()}]`;
    }
    s += '}';

    return s;
  }

  // todo:
  // ToFunds returns a Funds map from its string representation
  // func ToFunds(s string) Funds {}

  // Add returns the sum of the receiver and the input Funds objects
  add(...a: Funds[]): Funds {
    a.push(this);
    return Funds.sum(...a);
  }

  static sum(...a: Funds[]): Funds {
    const sum = new Funds();

    for (const funds of a) {
      for (const [asset, amount] of funds.value.entries()) {
        if (!sum.value.get(asset)) {
          sum.value.set(asset, BigInt(0));
        }

        sum.value.set(asset, sum.value.get(asset)! + amount);
      }
    }

    return sum;
  }

  // clone returns a deep copy of the receiver.
  clone(): Funds {
    return Funds.sum(this, new Funds());
  }
}

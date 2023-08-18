/* eslint-disable @typescript-eslint/no-use-before-define */
import assert from 'assert';
import _ from 'lodash';
import { ethers } from 'ethers';
import { Buffer } from 'buffer';

import { JSONbigNative } from './types';
import { bytes2Hex, hex2Bytes, zeroValueSignature } from './hex-utils';

// Signature is an ECDSA signature
type Signature = {
  r: Buffer | null;
  s: Buffer | null;
  v: number;
};

export interface FieldDescription {
  type: 'class' | 'string' | 'address' | 'number' | 'bigint' | 'uint' | 'uint64' | 'boolean' | 'buffer' | 'object' | 'array' | 'map' | 'signature';
  key?: FieldDescription;
  value?: FieldDescription | Record<string, FieldDescription> | any;
}

function decodeValue(fieldType: FieldDescription, fieldJsonValue: any): any {
  if (fieldJsonValue === undefined) {
    return fieldJsonValue;
  }

  switch (fieldType.type) {
    case 'class': {
      return fieldType.value.fromJSON(JSONbigNative.stringify(fieldJsonValue));
    }

    case 'string': {
      return String(fieldJsonValue);
    }

    case 'address': {
      return ethers.utils.getAddress(fieldJsonValue);
    }

    case 'number': {
      return Number(fieldJsonValue);
    }

    case 'boolean': {
      return String(fieldJsonValue) === 'true';
    }

    case 'bigint': {
      return fieldJsonValue === null ? undefined : BigInt(fieldJsonValue);
    }

    case 'uint':
    case 'uint64': {
      return BigInt(fieldJsonValue);
    }

    case 'buffer': {
      return fieldJsonValue === null ? null : Buffer.from(fieldJsonValue, 'base64');
    }

    case 'object': {
      assert(fieldType.value);
      const objectTypeEncodingMap = fieldType.value as Record<string, FieldDescription>;

      const objFieldValue: any = {};
      Object.keys(fieldJsonValue).forEach((key) => {
        const lowercaseFieldKey = lowercaseFirstLetter(key);
        objFieldValue[lowercaseFieldKey] = decodeValue(objectTypeEncodingMap[lowercaseFieldKey], fieldJsonValue[key]);
      });

      return objFieldValue;
    }

    case 'map': {
      assert(fieldType.key);
      assert(fieldType.value);

      return decodeMap(fieldType.key as FieldDescription, fieldType.value as FieldDescription, fieldJsonValue);
    }

    case 'array': {
      if (fieldJsonValue === null) {
        return null;
      }

      assert(fieldType.value);
      return fieldJsonValue.map((value: any) => decodeValue(fieldType.value as FieldDescription, value));
    }

    case 'signature': {
      return decodeSignature(fieldJsonValue);
    }

    default:
      throw new Error(`Unknown field type ${fieldType.type}`);
  }
}

// Go compatible JSON unmarshalling utility method
export function fromJSON(jsonEncodingMap: Record<string, any>, data: string, keysMap: Map<string, string> = new Map()): any {
  // Parse the JSON data string
  const jsonValue = JSONbigNative.parse(data);

  const props: any = {};

  Object.keys(jsonEncodingMap).forEach((fieldKey) => {
    const fieldType = jsonEncodingMap[fieldKey];

    // Use mapped key in props
    const propsKey = keysMap.get(fieldKey) ?? fieldKey;
    const capitalizedFieldKey = capitalizeFirstLetter(fieldKey);
    props[propsKey] = decodeValue(fieldType, jsonValue[capitalizedFieldKey]);
  });

  return props;
}

// Go compatible JSON marshalling utility method
export function toJSON(jsonEncodingMap: Record<string, any>, obj: any, keysMap: Map<string, string> = new Map()): any {
  let mappedObj: any = { ...obj };

  // Replace object keys with mapped & capitalized keys
  mappedObj = _.mapKeys(mappedObj, (value, key) => capitalizeFirstLetter(keysMap.get(key) ?? key));

  // Create a new object having keys in order of jsonEncodingMap keys
  const jsonObj: any = {};
  Object.keys(jsonEncodingMap).forEach((fieldKey) => {
    const fieldType = jsonEncodingMap[fieldKey];
    const capitalizedFieldKey = capitalizeFirstLetter(fieldKey);

    jsonObj[capitalizedFieldKey] = encodeValue(fieldType, mappedObj[capitalizedFieldKey]);
  });

  return jsonObj;
}

export function encodeMap(valueDescription: FieldDescription, mapValue: Map<any, any>): any {
  const mapObject: any = {};

  mapValue.forEach((value: any, key: any) => {
    // Use .toString() for keys (key type should have .toString() method)
    const capitalizedKey = capitalizeFirstLetter(key.toString());
    mapObject[capitalizedKey] = encodeValue(valueDescription, value);
  });

  return mapObject;
}

export function decodeMap(
  keyDescription: FieldDescription,
  valueDescription: FieldDescription,
  jsonMapValue: any,
): Map<any, any> {
  const mapValue = new Map();

  Object.keys(jsonMapValue).forEach((mapKey) => {
    const mapFieldKey = (keyDescription.type === 'string') ? lowercaseFirstLetter(mapKey) : decodeValue(keyDescription, mapKey);
    mapValue.set(
      mapFieldKey,
      decodeValue(valueDescription, jsonMapValue[mapKey]),
    );
  });

  return mapValue;
}

function encodeObject(objectDescription: Record<string, FieldDescription>, objectValue: any): any {
  const resultObject: any = {};

  Object.keys(objectDescription).forEach((fieldKey) => {
    const valueDescription = objectDescription[fieldKey];
    const capitalizedKey = capitalizeFirstLetter(fieldKey);
    resultObject[capitalizedKey] = encodeValue(valueDescription, objectValue[fieldKey]);
  });

  return resultObject;
}

function encodeArray(valueDescription: FieldDescription, arrayValue: Array<any> | null): any {
  return Array.isArray(arrayValue)
    ? arrayValue.map((value) => encodeValue(valueDescription, value))
    : null;
}

function encodeValue(fieldType: FieldDescription, fieldValue: any): any {
  switch (fieldType.type) {
    case 'map': {
      // Create a custom object if field is of a map type
      return encodeMap(fieldType.value as FieldDescription, fieldValue);
    }

    case 'object': {
      // Create a custom object if field is of an object type
      return encodeObject(fieldType.value as Record<string, FieldDescription>, fieldValue);
    }

    case 'array': {
      // Create a custom array if field is of an array type
      return encodeArray(fieldType.value as FieldDescription, fieldValue);
    }

    case 'bigint': {
      return fieldValue === undefined ? null : fieldValue;
    }

    case 'buffer': {
      // Marshall buffer as a base64 string
      return (fieldValue === null) ? null : (fieldValue as Buffer).toString('base64');
    }

    case 'address': {
      // Marshall address strings in lowercase
      return (fieldValue as string).toLowerCase();
    }

    case 'signature': {
      return encodeSignature(fieldValue as Signature);
    }

    default:
      return fieldValue;
  }
}

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function lowercaseFirstLetter(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function encodeSignature(sig: Signature): string {
  const sigHex = {
    r: `0x${bytes2Hex(sig.r ?? Buffer.alloc(0))}`,
    s: `0x${bytes2Hex(sig.s ?? Buffer.alloc(0))}`,
    v: sig.v,
  };

  return ethers.utils.hexlify(ethers.utils.concat([sigHex.r, sigHex.s, [sigHex.v]]));
}

// From crypto/signatures.go
function allZero(s: Buffer): boolean {
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== 0) {
      return false;
    }
  }

  return true;
}

function decodeSignature(sig: string): Signature {
  const sigBuf = hex2Bytes(sig);

  // If the signature is all zeros, we consider it to be the empty signature
  if (allZero(sigBuf)) {
    return zeroValueSignature;
  }

  if (sigBuf.length !== 65) {
    throw new Error(`signature must be 65 bytes long or a zero string, received ${sigBuf.length} bytes`);
  }

  const recSig = {
    r: sigBuf.subarray(0, 32),
    s: sigBuf.subarray(32, 64),
    v: Number(sigBuf[64]),
  };

  return recSig;
}

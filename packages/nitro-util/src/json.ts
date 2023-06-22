/* eslint-disable @typescript-eslint/no-use-before-define */
import assert from 'assert';
import _ from 'lodash';

import { JSONbigNative } from './types';

export interface FieldDescription {
  type: 'class' | 'string' | 'address' | 'number' | 'bigint' | 'uint64' | 'boolean' | 'buffer' | 'object' | 'array' | 'map';
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

    case 'address':
    case 'string': {
      return String(fieldJsonValue);
    }

    case 'number': {
      return Number(fieldJsonValue);
    }

    case 'boolean': {
      return String(fieldJsonValue) === 'true';
    }

    case 'bigint': {
      return BigInt(fieldJsonValue);
    }

    case 'uint64': {
      return BigInt(fieldJsonValue);
    }

    case 'buffer': {
      const bufferValue = (fieldJsonValue === null) ? '' : fieldJsonValue;
      return Buffer.from(bufferValue, 'base64');
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
      assert(fieldType.value);
      return fieldJsonValue.map((value: any) => decodeValue(fieldType.value as FieldDescription, value));
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
  let jsonObj: any = { ...obj };

  // Replace object keys with mapped & capitalized keys
  jsonObj = _.mapKeys(jsonObj, (value, key) => capitalizeFirstLetter(keysMap.get(key) ?? key));

  Object.keys(jsonEncodingMap).forEach((fieldKey) => {
    const fieldType = jsonEncodingMap[fieldKey];
    const capitalizedFieldKey = capitalizeFirstLetter(fieldKey);

    jsonObj[capitalizedFieldKey] = encodeValue(fieldType, jsonObj[capitalizedFieldKey]);
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

function encodeObject(objectDescription: Record<string, FieldDescription>, objectValue: Object): any {
  const resultObject: any = {};

  Object.entries(objectValue).forEach(([key, value]) => {
    const valueDescription = objectDescription[key];
    const capitalizedKey = capitalizeFirstLetter(key);
    resultObject[capitalizedKey] = encodeValue(valueDescription, value);
  });

  return resultObject;
}

function encodeArray(valueDescription: FieldDescription, arrayValue: Array<any>): any[] {
  return arrayValue.map((value) => encodeValue(valueDescription, value));
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

    // TODO: Handle nil pointer case
    // case 'bigint': {
    //   return fieldValue;
    // }

    case 'buffer': {
      // Marshall buffer as a base64 string
      return ((fieldValue as Buffer).length === 0) ? null : (fieldValue as Buffer).toString('base64');
    }

    case 'address': {
      // Marshall address strings in lowercase
      return (fieldValue as string).toLowerCase();
    }

    default:
      return fieldValue;
  }
}

export function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function lowercaseFirstLetter(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

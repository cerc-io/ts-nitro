/* eslint-disable @typescript-eslint/no-use-before-define */
import assert from 'assert';
import _ from 'lodash';

export interface FieldDescription {
  type: 'class' | 'string' | 'number' | 'bigint' | 'boolean' | 'buffer' | 'object' | 'array' | 'map';
  key?: FieldDescription;
  value?: FieldDescription | Record<string, FieldDescription> | any;
}

function decodeValue(fieldType: FieldDescription, fieldJsonValue: any): any {
  if (!fieldJsonValue) {
    return fieldJsonValue;
  }

  switch (fieldType.type) {
    case 'class': {
      return fieldType.value.fromJSON(JSON.stringify(fieldJsonValue));
    }

    case 'string':
    case 'number':
    case 'boolean': {
      return fieldJsonValue;
    }

    case 'bigint': {
      return BigInt(fieldJsonValue);
    }

    case 'buffer': {
      // TODO: Make buffer JSON marshalling similar to that in Go
      return Buffer.from(fieldJsonValue);
    }

    case 'object': {
      assert(fieldType.value);
      const objectTypeEncodingMap = fieldType.value as Record<string, FieldDescription>;

      const objFieldValue: any = {};
      Object.keys(fieldJsonValue).forEach((key) => {
        objFieldValue[key] = decodeValue(objectTypeEncodingMap[key], fieldJsonValue[key]);
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
  const jsonValue = JSON.parse(data);

  const props: any = {};

  Object.keys(jsonEncodingMap).forEach((fieldKey) => {
    const fieldType = jsonEncodingMap[fieldKey];

    // Use mapped key in props
    const propsKey = keysMap.get(fieldKey) ?? fieldKey;
    props[propsKey] = decodeValue(fieldType, jsonValue[fieldKey]);
  });

  return props;
}

// Go compatible JSON marshalling utility method
export function toJSON(jsonEncodingMap: Record<string, any>, obj: any, keysMap: Map<string, string> = new Map()): any {
  let jsonObj: any = { ...obj };

  // Replace object keys with mapped keys
  jsonObj = _.mapKeys(jsonObj, (value, key) => keysMap.get(key) ?? key);

  Object.keys(jsonEncodingMap).forEach((fieldKey) => {
    const fieldType = jsonEncodingMap[fieldKey];
    jsonObj[fieldKey] = encodeValue(fieldType, jsonObj[fieldKey]);
  });

  return jsonObj;
}

export function encodeMap(valueDescription: FieldDescription, mapValue: Map<any, any>): any {
  const mapObject: any = {};

  mapValue.forEach((value: any, key: any) => {
    // Use .toString() for keys (key type should have .toString() method)
    mapObject[key.toString()] = encodeValue(valueDescription, value);
  });

  return mapObject;
}

export function decodeMap(
  keyDescription: FieldDescription,
  valueDescription: FieldDescription,
  jsonMapValue: any,
): Map<any, any> {
  const mapFieldvalue = new Map();

  Object.keys(jsonMapValue).forEach((mapKey) => {
    mapFieldvalue.set(
      decodeValue(keyDescription, mapKey),
      decodeValue(valueDescription, jsonMapValue[mapKey]),
    );
  });

  return mapFieldvalue;
}

function encodeValue(fieldType: FieldDescription, fieldValue: any): any {
  let jsonObjValue: any = fieldValue;

  // Create a custom object if field is of a map type
  if (fieldType.type === 'map') {
    jsonObjValue = encodeMap(fieldType.value as FieldDescription, fieldValue);
  }

  // Marshall bigint as a string
  if (fieldType.type === 'bigint') {
    jsonObjValue = (fieldValue as bigint).toString();
  }

  return jsonObjValue;
}

/* eslint-disable @typescript-eslint/no-use-before-define */
import assert from 'assert';

export interface FieldDescription {
  type: 'class' | 'string' | 'number' | 'bigint' | 'boolean' | 'buffer' | 'object' | 'array' | 'map';
  key?: FieldDescription;
  value?: FieldDescription | Record<string, FieldDescription> | any;
}

function decodeValue(fieldType: FieldDescription, fieldJsonValue: any): any {
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

      const mapKeyType = fieldType.key;
      const mapValueType = fieldType.value as FieldDescription;

      const jsonMapValue = fieldJsonValue;
      const mapFieldvalue = new Map();

      Object.keys(jsonMapValue).forEach((mapKey) => {
        mapFieldvalue.set(
          decodeValue(mapKeyType, mapKey),
          decodeValue(mapValueType, jsonMapValue[mapKey]),
        );
      });

      return mapFieldvalue;
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
export function fromJSON(jsonEncodingMap: Record<string, any>, data: any): any {
  const props: any = {};

  Object.keys(jsonEncodingMap).forEach((fieldKey) => {
    const fieldType = jsonEncodingMap[fieldKey];
    props[fieldKey] = decodeValue(fieldType, data[fieldKey]);
  });

  return props;
}

// Go compatible JSON marshalling utility method
export function toJSON(jsonEncodingMap: Record<string, any>, obj: any): any {
  const jsonObj: any = { ...obj };

  Object.keys(jsonEncodingMap).forEach((fieldKey) => {
    const fieldType = jsonEncodingMap[fieldKey];

    // Create a custom object if field is of a map type
    if (fieldType.type === 'map') {
      const mapObject: any = {};

      obj[fieldKey].forEach((value: any, key: any) => {
        // Use .toString() for keys (key type should have .toString() method)
        mapObject[key.toString()] = value;
      });

      jsonObj[fieldKey] = mapObject;
    }
  });

  return jsonObj;
}

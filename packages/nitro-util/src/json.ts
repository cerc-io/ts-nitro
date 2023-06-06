function decodeValue(fieldType: any, fieldJsonValue: any): any {
  switch (fieldType.type) {
    case 'class': {
      return fieldType.value.fromJSON(JSON.stringify(fieldJsonValue));
    }

    case 'string':
    case 'number': {
      return fieldJsonValue;
    }

    case 'map': {
      const jsonMapValue = fieldJsonValue;
      const mapFieldvalue = new Map();

      Object.keys(jsonMapValue).forEach((mapKey) => {
        mapFieldvalue.set(
          decodeValue(fieldType.key, mapKey),
          decodeValue(fieldType.value, jsonMapValue[mapKey]),
        );
      });

      return mapFieldvalue;
    }

    case 'array': {
      return fieldJsonValue.map((value: any) => decodeValue(fieldType.value, value));
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

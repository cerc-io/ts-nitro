function decodeValue(fieldType: any, fieldJsonValue: any): any {
  switch (fieldType.type) {
    case 'class': {
      return fieldType.value.fromJSON(fieldJsonValue);
    }

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
      const jsonArrayValue = fieldJsonValue;

      return Array.from(jsonArrayValue).map((value) => decodeValue(fieldType.value, value));
    }

    default:
      throw new Error(`Unknown field type ${fieldType.type}`);
  }
}

// Go compatible JSON marshalling utility method
export function fromJSON(jsonEncodingMap: Record<string, any>, data: any): any {
  const props: any = {};

  Object.keys(jsonEncodingMap).forEach((fieldKey) => {
    const fieldType = jsonEncodingMap[fieldKey];
    props[fieldKey] = decodeValue(fieldType, data[fieldKey]);
  });

  return props;
}

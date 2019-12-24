import {DataType} from 'neuroglancer/sliceview/volume/base';
import {Endianness} from 'neuroglancer/util/endian';


const endianessLookup: { [index:string]: Endianness } = {
  ">": Endianness.BIG,
  "<": Endianness.LITTLE,
};

const dataTypeLookup: { [index:string]: DataType } =  {
  "u1": DataType.UINT8,
  "u2": DataType.UINT16,
  "u4": DataType.UINT32,
  "u8": DataType.UINT64,
  "f4": DataType.FLOAT32,
};

export function decodeDataType(format: string): [DataType, Endianness] {
  if (format.length != 3) {
    throw new Error(`Unsupported dtype string: "${format}"`);
  }

  const endianessAbbr = format[0];
  const dataTypeAbbr = format.slice(1, 3);
  const dataType = dataTypeLookup[dataTypeAbbr];
  let endianess = endianessLookup[endianessAbbr];

  if (dataType === undefined) {
    throw new Error(`Unsupported datatype ${dataTypeAbbr}`);
  }

  if (dataType === DataType.UINT8) {
    endianess = Endianness.LITTLE;
  }

  if (endianess === undefined) {
    throw new Error(`Invalid endianess for datatype ${dataType}`);
  }

  return [dataType, endianess];
}

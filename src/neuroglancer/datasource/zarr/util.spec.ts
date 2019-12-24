import {DataType} from 'neuroglancer/sliceview/volume/base';
import {Endianness} from 'neuroglancer/util/endian';
import {decodeDataType} from 'neuroglancer/datasource/zarr/util';

describe('decode dtype', () => {
  const tests = [
    {dtype: "|u1", expectedType: DataType.UINT8, expectedEndianess: Endianness.LITTLE},
    {dtype: "<u2", expectedType: DataType.UINT16, expectedEndianess: Endianness.LITTLE},
    {dtype: "<u4", expectedType: DataType.UINT32, expectedEndianess: Endianness.LITTLE},
    {dtype: "<u8", expectedType: DataType.UINT64, expectedEndianess: Endianness.LITTLE},
    {dtype: "<f4", expectedType: DataType.FLOAT32, expectedEndianess: Endianness.LITTLE},
    {dtype: ">u2", expectedType: DataType.UINT16, expectedEndianess: Endianness.BIG},
    {dtype: ">u4", expectedType: DataType.UINT32, expectedEndianess: Endianness.BIG},
    {dtype: ">u8", expectedType: DataType.UINT64, expectedEndianess: Endianness.BIG},
    {dtype: ">f4", expectedType: DataType.FLOAT32, expectedEndianess: Endianness.BIG},
  ];
  tests.forEach(function(test) {
    it(`decode ${test.dtype}`, () => {
      const [dataType, endianess] = decodeDataType(test.dtype);
      expect(dataType).toBe(test.expectedType);
      expect(endianess).toBe(test.expectedEndianess);
    });
  });
});

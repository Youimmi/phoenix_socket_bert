const utf8 = {
  decode: (buffer) => {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  },
};

export const decode = (buffer) => {
  const data = new Uint8Array(buffer);
  let index = 0;

  const read = {
    uint8: () => data[index++],
    uint16: () => (index += 2, (data[index - 2] << 8) | data[index - 1]),
    uint32: () => (index += 4, (data[index - 4] << 24) | (data[index - 3] << 16) | (data[index - 2] << 8) | data[index - 1]),
    slice: (length) => (index += length, new Uint8Array(buffer, index - length, length)),
  };

  const decodeBignum = (size) => {
    let result = 0, sign = read.uint8();
    for (let i = size - 1; i >= 0; i--) result = (result * 256) + data[index + i];
    index += size;
    return sign === 0 ? result : -result;
  };

  const decodeTuple = (size) => Array.from({ length: size }, decodeType);

  const decodeList = (size) => {
    const result = Array.from({ length: size }, decodeType);
    decodeType();
    return result;
  };

  const decodeMap = (size) => Object.fromEntries(Array.from({ length: size }, () => [decodeType(), decodeType()]));

  const decodeType = () => {
    const type = read.uint8();
    switch (type) {
      case 80: return read.slice(read.uint16());
      case 97: return read.uint8();
      case 98: return (index += 4, new DataView(buffer, index - 4, 4).getInt32(0));
      case 100: return utf8.decode(read.slice(read.uint16()));
      case 104: return decodeTuple(read.uint8());
      case 105: return decodeTuple(read.uint32());
      case 106: return [];
      case 108: return decodeList(read.uint32());
      case 109: return utf8.decode(read.slice(read.uint32()));
      case 110: return decodeBignum(read.uint8());
      case 111: return decodeBignum(read.uint32());
      case 115: return utf8.decode(read.slice(read.uint8()));
      case 116: return decodeMap(read.uint32());
      case 119: return utf8.decode(read.slice(read.uint8()));
      default: throw new Error(`Unsupported type: ${type}`);
    }
  };

  if (read.uint8() !== 131) throw new Error("Invalid BERT format");
  return decodeType();
};

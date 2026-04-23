const utf8Decoder = new TextDecoder();
let latin1Decoder;
try {
  latin1Decoder = new TextDecoder("latin1");
} catch (_) {}

export const decode = (buffer) => {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let index = 0;
  const read = {
    u8: () => data[index++],
    u16: () => {
      const v = view.getUint16(index, false);
      index += 2;
      return v;
    },
    u32: () => {
      const v = view.getUint32(index, false);
      index += 4;
      return v;
    },
    slice: (len) => data.subarray(index, (index += len)),
  };
  if (read.u8() !== 131) throw new Error("Invalid BERT format");

  const decodeBig = (size) => {
    const sign = read.u8();
    if (size === 0) return 0;
    let num = 0;
    let factor = 1;
    for (let j = 0; j < size; j++) {
      num += data[index++] * factor;
      if (num > Number.MAX_SAFE_INTEGER)
        throw new Error("Integer exceeds safe Number range");
      factor *= 256;
    }
    return sign ? -num : num;
  };

  const binToLatin1 = (b) => {
    if (latin1Decoder) return latin1Decoder.decode(b);
    let s = "";
    for (let j = 0; j < b.length; j++) s += String.fromCharCode(b[j]);
    return s;
  };
  const stringExt = (b) => {
    const out = new Array(b.length);
    for (let k = 0; k < b.length; k++) out[k] = b[k];
    return out;
  };

  const decodeListBody = (len) => {
    const arr = new Array(len);
    for (let j = 0; j < len; j++) arr[j] = decodeType();
    const tailTag = data[index];
    if (tailTag === 106) {
      index++;
      return arr;
    }
    const tail = decodeType();
    if (!(Array.isArray(tail) && tail.length === 0) && tail !== undefined)
      Object.defineProperty(arr, "__tail", { value: tail, enumerable: false });
    return arr;
  };
  const decodeTuple = (size) => {
    const t = new Array(size);
    for (let j = 0; j < size; j++) t[j] = decodeType();
    return t;
  };
  const decodeMap = (size) => {
    const m = Object.create(null);
    for (let j = 0; j < size; j++) m[decodeType()] = decodeType();
    return m;
  };
  const decodeFloat = () => {
    const v = view.getFloat64(index, false);
    index += 8;
    return v;
  };

  const decodeType = () => {
    const tag = read.u8();
    switch (tag) {
      case 97:
        return read.u8();
      case 98: {
        const v = read.u32();
        return v & 0x80000000 ? v - 0x100000000 : v;
      }
      case 104:
        return decodeTuple(read.u8());
      case 105:
        return decodeTuple(read.u32());
      case 106:
        return [];
      case 107:
        return stringExt(read.slice(read.u16()));
      case 108:
        return decodeListBody(read.u32());
      case 109:
        return utf8Decoder.decode(read.slice(read.u32()));
      case 110:
        return decodeBig(read.u8());
      case 111:
        return decodeBig(read.u32());
      case 115:
        return binToLatin1(read.slice(read.u8()));
      case 100:
        return binToLatin1(read.slice(read.u16()));
      case 119:
        return utf8Decoder.decode(read.slice(read.u8()));
      case 118:
        return utf8Decoder.decode(read.slice(read.u16()));
      case 116:
        return decodeMap(read.u32());
      case 70:
        return decodeFloat();
      default:
        throw new Error("Unsupported type: " + tag);
    }
  };

  return decodeType();
};

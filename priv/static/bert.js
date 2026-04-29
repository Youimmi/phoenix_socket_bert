const utf8Decoder = new TextDecoder();

const latin1 = (data, i, len) => {
  let s = "";
  for (let j = 0; j < len; j++) s += String.fromCharCode(data[i + j]);
  return s;
};

const stringExt = (data, i, len) => {
  const out = new Array(len);
  for (let j = 0; j < len; j++) out[j] = data[i + j];
  return out;
};

const atom = (data, i, len, utf8) => {
  if (
    len === 3 &&
    data[i] === 110 &&
    data[i + 1] === 105 &&
    data[i + 2] === 108
  )
    return null;
  if (
    len === 4 &&
    data[i] === 116 &&
    data[i + 1] === 114 &&
    data[i + 2] === 117 &&
    data[i + 3] === 101
  )
    return true;
  if (
    len === 5 &&
    data[i] === 102 &&
    data[i + 1] === 97 &&
    data[i + 2] === 108 &&
    data[i + 3] === 115 &&
    data[i + 4] === 101
  )
    return false;
  return utf8
    ? utf8Decoder.decode(data.subarray(i, i + len))
    : latin1(data, i, len);
};

export const decode = (buffer) => {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let index = 0;

  if (data[index++] !== 131) throw new Error("Invalid BERT format");

  const big = (size) => {
    const sign = data[index++];
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

  const type = () => {
    switch (data[index++]) {
      case 70: {
        const v = view.getFloat64(index, false);
        index += 8;
        return v;
      }
      case 97:
        return data[index++];
      case 98: {
        const v = view.getUint32(index, false);
        index += 4;
        return v & 0x80000000 ? v - 0x100000000 : v;
      }
      case 100: {
        const len = view.getUint16(index, false);
        index += 2;
        const i = index;
        index += len;
        return atom(data, i, len, false);
      }
      case 104: {
        const size = data[index++];
        const arr = new Array(size);
        for (let j = 0; j < size; j++) arr[j] = type();
        return arr;
      }
      case 105: {
        const size = view.getUint32(index, false);
        index += 4;
        const arr = new Array(size);
        for (let j = 0; j < size; j++) arr[j] = type();
        return arr;
      }
      case 106:
        return [];
      case 107: {
        const len = view.getUint16(index, false);
        index += 2;
        const out = stringExt(data, index, len);
        index += len;
        return out;
      }
      case 108: {
        const len = view.getUint32(index, false);
        index += 4;
        const arr = new Array(len);
        for (let j = 0; j < len; j++) arr[j] = type();
        if (data[index] === 106) {
          index++;
          return arr;
        }
        const tail = type();
        if (!(Array.isArray(tail) && tail.length === 0) && tail !== undefined)
          Object.defineProperty(arr, "__tail", {
            value: tail,
            enumerable: false,
          });
        return arr;
      }
      case 109: {
        const len = view.getUint32(index, false);
        index += 4;
        const i = index;
        index += len;
        return utf8Decoder.decode(data.subarray(i, index));
      }
      case 110: {
        const size = data[index++];
        return big(size);
      }
      case 111: {
        const size = view.getUint32(index, false);
        index += 4;
        return big(size);
      }
      case 115: {
        const len = data[index++];
        const i = index;
        index += len;
        return atom(data, i, len, false);
      }
      case 116: {
        const size = view.getUint32(index, false);
        index += 4;
        const obj = Object.create(null);
        for (let j = 0; j < size; j++) obj[type()] = type();
        return obj;
      }
      case 118: {
        const len = view.getUint16(index, false);
        index += 2;
        const i = index;
        index += len;
        return atom(data, i, len, true);
      }
      case 119: {
        const len = data[index++];
        const i = index;
        index += len;
        return atom(data, i, len, true);
      }
      default:
        throw new Error("Unsupported type: " + data[index - 1]);
    }
  };

  return type();
};

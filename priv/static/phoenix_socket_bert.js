const decoder = new TextDecoder();

let termData;
let termIndex;
let termView;

export const decode = (rawPayload, callback) => {
  termData = new Uint8Array(rawPayload);
  termIndex = 3;
  termView = null;

  const message = {
    join_ref: term(),
    ref: term(),
    topic: term(),
    event: term(),
    payload: term(),
  };

  termData = termView = null;
  return callback(message);
};

const readUint32 = () => {
  const value =
    termData[termIndex] * 0x1000000 +
    (termData[termIndex + 1] << 16) +
    (termData[termIndex + 2] << 8) +
    termData[termIndex + 3];
  termIndex += 4;
  return value;
};

const term = () => {
  switch (termData[termIndex++]) {
    case 70: {
      if (termView === null) termView = new DataView(termData.buffer);
      const value = termView.getFloat64(termIndex, false);
      termIndex += 8;
      return value;
    }
    case 97:
      return termData[termIndex++];
    case 98: {
      const value = readUint32();
      return value >= 0x80000000 ? value - 0x100000000 : value;
    }
    case 104: {
      const arr = new Array(termData[termIndex++]);
      for (let i = 0; i < arr.length; i++) arr[i] = term();
      return arr;
    }
    case 106:
      return [];
    case 107: {
      const arr = new Array(
        (termData[termIndex] << 8) | termData[termIndex + 1],
      );
      termIndex += 2;
      for (let i = 0; i < arr.length; i++) arr[i] = termData[termIndex++];
      return arr;
    }
    case 108: {
      const arr = new Array(readUint32());
      for (let i = 0; i < arr.length; i++) arr[i] = term();
      termIndex++;
      return arr;
    }
    case 109: {
      const len = readUint32();
      const i = termIndex;
      termIndex += len;
      return decoder.decode(termData.subarray(i, termIndex));
    }
    case 110: {
      let size = termData[termIndex++];
      const sign = termData[termIndex++];
      let num = 0;
      let factor = 1;
      while (size--) {
        num += termData[termIndex++] * factor;
        if (num > Number.MAX_SAFE_INTEGER)
          throw new Error("Integer exceeds safe Number range");
        factor *= 256;
      }
      return sign ? -num : num;
    }
    case 116: {
      let size = readUint32();
      const obj = {};
      while (size--) obj[term()] = term();
      return obj;
    }
    case 119: {
      const len = termData[termIndex++];
      const i = termIndex;
      termIndex += len;

      if (
        len === 3 &&
        termData[i] === 110 &&
        termData[i + 1] === 105 &&
        termData[i + 2] === 108
      )
        return null;
      if (
        len === 4 &&
        termData[i] === 116 &&
        termData[i + 1] === 114 &&
        termData[i + 2] === 117 &&
        termData[i + 3] === 101
      )
        return true;
      if (
        len === 5 &&
        termData[i] === 102 &&
        termData[i + 1] === 97 &&
        termData[i + 2] === 108 &&
        termData[i + 3] === 115 &&
        termData[i + 4] === 101
      )
        return false;

      let value = "";
      for (let j = i; j < termIndex; j++) {
        if (termData[j] > 127)
          return decoder.decode(termData.subarray(i, termIndex));
        value += String.fromCharCode(termData[j]);
      }
      return value;
    }
    default:
      throw new Error("Unsupported type: " + termData[termIndex - 1]);
  }
};

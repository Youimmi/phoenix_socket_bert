"use strict";

const BERT_MAGIC = 131;
const BROADCAST = 2;
const PHX_REPLY = "phx_reply";
const PUSH = 0;
const REPLY = 1;
const textDecoder = new TextDecoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

let termData;
let termIndex = 0;
let termView;

const atom = (data, i, len, isUtf8) => {
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
  return isUtf8 ? utf8(data, i, len) : latin1(data, i, len);
};

const big = (size) => {
  const sign = termData[termIndex++];
  if (size === 0) return 0;
  let num = 0;
  let factor = 1;
  for (let j = 0; j < size; j++) {
    num += termData[termIndex++] * factor;
    if (num > Number.MAX_SAFE_INTEGER)
      throw new Error("Integer exceeds safe Number range");
    factor *= 256;
  }
  return sign ? -num : num;
};

const decodeBert = (data) => {
  termData = data;
  termIndex = 0;
  termView = null;

  if (termData[termIndex++] !== BERT_MAGIC)
    throw new Error("Invalid BERT format");

  const message = term();

  return {
    join_ref: message[0],
    ref: message[1],
    topic: message[2],
    event: message[3],
    payload: message[4],
  };
};

const decodeBinary = (data, copyBinary) => {
  switch (data[0]) {
    case BROADCAST: {
      const topicSize = data[1];
      const eventSize = data[2];
      let offset = 3;
      const topic = readString(data, offset, topicSize);
      offset += topicSize;
      const event = readString(data, offset, eventSize);
      offset += eventSize;

      return {
        join_ref: null,
        ref: null,
        topic,
        event,
        payload: readBinary(data, offset, copyBinary),
      };
    }

    case PUSH: {
      const joinRefSize = data[1];
      const topicSize = data[2];
      const eventSize = data[3];
      let offset = 4;
      const join_ref = readString(data, offset, joinRefSize);
      offset += joinRefSize;
      const topic = readString(data, offset, topicSize);
      offset += topicSize;
      const event = readString(data, offset, eventSize);
      offset += eventSize;

      return {
        join_ref,
        ref: null,
        topic,
        event,
        payload: readBinary(data, offset, copyBinary),
      };
    }

    case REPLY: {
      const joinRefSize = data[1];
      const refSize = data[2];
      const topicSize = data[3];
      const statusSize = data[4];
      let offset = 5;
      const join_ref = readString(data, offset, joinRefSize);
      offset += joinRefSize;
      const ref = readString(data, offset, refSize);
      offset += refSize;
      const topic = readString(data, offset, topicSize);
      offset += topicSize;
      const status = readString(data, offset, statusSize);
      offset += statusSize;

      return {
        join_ref,
        ref,
        topic,
        event: PHX_REPLY,
        payload: {
          status,
          response: readBinary(data, offset, copyBinary),
        },
      };
    }

    default:
      throw new Error("Unsupported Phoenix binary frame: " + data[0]);
  }
};

const decodeJson = (rawPayload) => {
  const message = JSON.parse(rawPayload);

  return {
    join_ref: message[0],
    ref: message[1],
    topic: message[2],
    event: message[3],
    payload: message[4],
  };
};

const latin1 = (data, i, len) => {
  let s = "";
  for (let j = 0; j < len; j++) s += String.fromCharCode(data[i + j]);
  return s;
};

const readBinary = (data, offset, copyBinary) => {
  if (!copyBinary) return data.subarray(offset);

  return data.buffer.slice(
    data.byteOffset + offset,
    data.byteOffset + data.length,
  );
};

const readFloat64 = () => {
  if (termView === null)
    termView = new DataView(
      termData.buffer,
      termData.byteOffset,
      termData.byteLength,
    );

  const value = termView.getFloat64(termIndex, false);
  termIndex += 8;
  return value;
};

const readString = (data, offset, size) => {
  const end = offset + size;
  let string = "";

  for (let i = offset; i < end; i++) {
    if (data[i] > 127) return readText(data, offset, size);
    string += String.fromCharCode(data[i]);
  }

  return string;
};

const readText = (data, i, len) => {
  return textDecoder.decode(data.subarray(i, i + len));
};

const readUtf8 = (data, i, len) => {
  return utf8Decoder.decode(data.subarray(i, i + len));
};

const readUint16 = () => {
  const value = (termData[termIndex] << 8) | termData[termIndex + 1];
  termIndex += 2;
  return value;
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

const stringExt = (data, i, len) => {
  const out = new Array(len);
  for (let j = 0; j < len; j++) out[j] = data[i + j];
  return out;
};

const term = () => {
  switch (termData[termIndex++]) {
    case 70: {
      return readFloat64();
    }
    case 97:
      return termData[termIndex++];
    case 98: {
      const value = readUint32();
      return value >= 0x80000000 ? value - 0x100000000 : value;
    }
    case 100: {
      const len = readUint16();
      const i = termIndex;
      termIndex += len;
      return atom(termData, i, len, false);
    }
    case 104: {
      const size = termData[termIndex++];
      const arr = new Array(size);
      for (let j = 0; j < size; j++) arr[j] = term();
      return arr;
    }
    case 105: {
      const size = readUint32();
      const arr = new Array(size);
      for (let j = 0; j < size; j++) arr[j] = term();
      return arr;
    }
    case 106:
      return [];
    case 107: {
      const len = readUint16();
      const out = stringExt(termData, termIndex, len);
      termIndex += len;
      return out;
    }
    case 108: {
      const len = readUint32();
      const arr = new Array(len);
      for (let j = 0; j < len; j++) arr[j] = term();
      if (termData[termIndex] === 106) {
        termIndex++;
        return arr;
      }
      const tail = term();
      if (!(Array.isArray(tail) && tail.length === 0) && tail !== undefined)
        Object.defineProperty(arr, "__tail", {
          value: tail,
          enumerable: false,
        });
      return arr;
    }
    case 109: {
      const len = readUint32();
      const i = termIndex;
      termIndex += len;
      return utf8(termData, i, len);
    }
    case 110: {
      const size = termData[termIndex++];
      return big(size);
    }
    case 111: {
      const size = readUint32();
      return big(size);
    }
    case 115: {
      const len = termData[termIndex++];
      const i = termIndex;
      termIndex += len;
      return atom(termData, i, len, false);
    }
    case 116: {
      const size = readUint32();
      const obj = Object.create(null);
      for (let j = 0; j < size; j++) obj[term()] = term();
      return obj;
    }
    case 118: {
      const len = readUint16();
      const i = termIndex;
      termIndex += len;
      return atom(termData, i, len, true);
    }
    case 119: {
      const len = termData[termIndex++];
      const i = termIndex;
      termIndex += len;
      return atom(termData, i, len, true);
    }
    default:
      throw new Error("Unsupported type: " + termData[termIndex - 1]);
  }
};

const utf8 = (data, i, len) => {
  const end = i + len;
  let string = "";

  for (let j = i; j < end; j++) {
    if (data[j] > 127) return readUtf8(data, i, len);
    string += String.fromCharCode(data[j]);
  }

  return string;
};

export const decode = (rawPayload, callback) => {
  if (rawPayload.constructor === ArrayBuffer) {
    const data = new Uint8Array(rawPayload);

    return callback(
      data[0] === BERT_MAGIC ? decodeBert(data) : decodeBinary(data, true),
    );
  }

  if (rawPayload.constructor === Uint8Array) {
    return callback(
      rawPayload[0] === BERT_MAGIC
        ? decodeBert(rawPayload)
        : decodeBinary(rawPayload, false),
    );
  }

  return callback(decodeJson(rawPayload));
};

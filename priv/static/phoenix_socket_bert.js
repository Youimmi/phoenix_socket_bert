const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

let data = null;
let view = null;
let index = 0;
let terms = 0;

const array = (size, depth) => {
  limit(size, depth, size);
  const values = new Array(size);
  const next = depth + 1;
  for (let i = 0; i < size; i++) {
    if (data[index] === 70 && index + 9 <= data.length) {
      values[i] = float(index + 1);
      index += 9;
    } else {
      values[i] = term(next);
    }
  }
  return values;
};

const big = () => {
  const size = data[take(1)];
  const sign = data[take(1)];
  if (sign > 1) fail("Invalid BERT integer sign");
  const start = take(size);
  let value = 0;
  for (let i = start + size - 1; i >= start; i--) {
    value = value * 256 + data[i];
    if (!Number.isSafeInteger(value)) fail("Integer exceeds safe Number range");
  }
  return sign ? -value : value;
};

const fail = (message) => {
  throw new Error(message);
};

const field = (tag) => {
  if (data[index] !== tag) fail("Invalid BERT message");
  return term(1);
};

const float = (at) => {
  const value = view.getFloat64(at, false);
  if (!Number.isFinite(value)) fail("Invalid BERT float");
  return value;
};

const frame = (kind) => {
  switch (kind) {
    case 0: {
      const joinRefSize = data[take(1)];
      const topicSize = data[take(1)];
      const eventSize = data[take(1)];
      return {
        join_ref: text(joinRefSize),
        ref: null,
        topic: text(topicSize),
        event: text(eventSize),
        payload: rest(),
      };
    }
    case 1: {
      const joinRefSize = data[take(1)];
      const refSize = data[take(1)];
      const topicSize = data[take(1)];
      const statusSize = data[take(1)];
      return {
        join_ref: text(joinRefSize),
        ref: text(refSize),
        topic: text(topicSize),
        event: "phx_reply",
        payload: { status: text(statusSize), response: rest() },
      };
    }
    case 2: {
      const topicSize = data[take(1)];
      const eventSize = data[take(1)];
      return {
        join_ref: null,
        ref: null,
        topic: text(topicSize),
        event: text(eventSize),
        payload: rest(),
      };
    }
    default:
      return fail("Invalid binary frame kind");
  }
};

const limit = (size, depth, count) => {
  if (size > 65536 || count > terms || (size > 0 && depth >= 64)) {
    fail("BERT collection limit exceeded");
  }
  if (count > data.length - index) fail("Truncated BERT collection");
  terms -= count;
};

const read = (payload) => {
  if (payload instanceof ArrayBuffer) {
    data = new Uint8Array(payload);
  } else if (ArrayBuffer.isView(payload)) {
    data = new Uint8Array(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
  } else {
    throw new TypeError("Expected a binary BERT frame");
  }
  if (data.length > 2097152) fail("BERT frame too large");
  index = 0;
  const kind = data[take(1)];
  if (kind !== 131) return frame(kind);
  view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  terms = 262144 - 6;
  if (data[take(1)] !== 104 || data[take(1)] !== 5) {
    fail("Invalid BERT message header");
  }
  const message = {
    join_ref: ref(),
    ref: ref(),
    topic: field(109),
    event: field(109),
    payload: field(116),
  };
  if (index !== data.length) fail("Invalid BERT message");
  return message;
};

const ref = () => {
  if (data[index] === 109) return term(1);
  if (field(119) !== null) fail("Invalid BERT message");
  return null;
};

const rest = () => data.slice(index).buffer;

const scalar = (tag) => {
  switch (tag) {
    case 97:
      return data[take(1)];
    case 98:
      return view.getInt32(take(4), false);
    case 109:
      return text(view.getUint32(take(4), false));
    case 110:
      return big();
    case 119:
      return text(data[take(1)]);
    default:
      return fail("Unsupported BERT type: " + tag);
  }
};

const take = (size) => {
  const start = index;
  if (size > data.length - start) fail("Truncated BERT frame");
  index = start + size;
  return start;
};

const term = (depth) => {
  const tag = data[take(1)];
  switch (tag) {
    case 70:
      return float(take(8));
    case 104:
      return array(data[take(1)], depth);
    case 106:
      return [];
    case 107: {
      const size = view.getUint16(take(2), false);
      limit(size, depth, size);
      const start = take(size);
      const values = new Array(size);
      for (let i = 0; i < size; i++) values[i] = data[start + i];
      return values;
    }
    case 108: {
      const values = array(view.getUint32(take(4), false), depth);
      if (data[take(1)] !== 106) fail("Improper BERT list");
      return values;
    }
    case 116: {
      const size = view.getUint32(take(4), false);
      limit(size, depth, size * 2);
      const values = {};
      const next = depth + 1;
      for (let i = 0; i < size; i++) {
        const name = scalar(data[take(1)]);
        const value = term(next);
        if (name === "__proto__") {
          Object.defineProperty(values, name, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
        } else {
          values[name] = value;
        }
      }
      return values;
    }
    case 119: {
      const value = text(data[take(1)]);
      if (value === "nil") return null;
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    }
    default:
      return scalar(tag);
  }
};

const text = (size) => {
  const start = take(size);
  const end = start + size;
  if (size <= 32) {
    let value = "";
    for (let i = start; i < end; i++) {
      const byte = data[i];
      if (byte > 127) return decoder.decode(data.subarray(start, end));
      value += String.fromCharCode(byte);
    }
    return value;
  }
  return decoder.decode(data.subarray(start, end));
};

export const decode = (payload, callback, onError) => {
  let message;
  try {
    message = read(payload);
  } catch (error) {
    if (!onError) throw error;
    return onError(error);
  } finally {
    data = view = null;
  }
  return callback(message);
};

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

let data = null;
let view = null;
let index = 0;
let terms = 0;

const fail = (message) => {
  throw new Error(message);
};

const take = (size) => {
  const start = index;
  if (size > data.length - start) fail("Truncated BERT frame");
  index = start + size;
  return start;
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

const limit = (size, depth, count) => {
  if (size > 65536 || count > terms || (size > 0 && depth >= 64)) fail("BERT collection limit exceeded");
  if (count > data.length - index) fail("Truncated BERT collection");
};

const float = (at) => {
  const value = view.getFloat64(at, false);
  if (!Number.isFinite(value)) fail("Invalid BERT float");
  return value;
};

const array = (size, depth) => {
  limit(size, depth, size);
  const values = new Array(size);
  const next = depth + 1;
  for (let i = 0; i < size; i++) {
    // Decode floats inline: numeric arrays are common and dominate recursive dispatch.
    if (data[index] === 70 && next <= 64 && terms > 0 && index + 9 <= data.length) {
      terms--;
      values[i] = float(index + 1);
      index += 9;
    } else values[i] = term(next);
  }
  return values;
};

const key = (depth) => {
  if (depth > 64 || terms-- <= 0) fail("BERT term limit exceeded");
  switch (data[take(1)]) {
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
      return fail("Unsupported BERT map key");
  }
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

const term = (depth) => {
  if (depth > 64 || terms-- <= 0) fail("BERT term limit exceeded");
  const tag = data[take(1)];
  switch (tag) {
    case 70:
      return float(take(8));
    case 97:
      return data[take(1)];
    case 98:
      return view.getInt32(take(4), false);
    case 104:
      return array(data[take(1)], depth);
    case 106:
      return [];
    case 107: {
      const size = view.getUint16(take(2), false);
      limit(size, depth, size);
      terms -= size;
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
    case 109:
      return text(view.getUint32(take(4), false));
    case 110:
      return big();
    case 116: {
      const size = view.getUint32(take(4), false);
      limit(size, depth, size * 2);
      const values = {};
      const next = depth + 1;
      for (let i = 0; i < size; i++) {
        const name = key(next);
        const value = term(next);
        if (name === "__proto__")
          Object.defineProperty(values, name, { value, enumerable: true, configurable: true, writable: true });
        else values[name] = value;
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
      return fail("Unsupported BERT type: " + tag);
  }
};

const read = (payload) => {
  if (payload instanceof ArrayBuffer) data = new Uint8Array(payload);
  else if (ArrayBuffer.isView(payload)) data = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  else throw new TypeError("Expected a binary BERT frame");
  if (data.length > 2097152) fail("BERT frame too large");
  view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  index = 0;
  terms = 262143; // The five-element message tuple is one term.
  if (data[take(1)] !== 131 || data[take(1)] !== 104 || data[take(1)] !== 5) fail("Invalid BERT message header");
  const message = { join_ref: term(1), ref: term(1), topic: term(1), event: term(1), payload: term(1) };
  if (
    index !== data.length ||
    !(message.join_ref === null || typeof message.join_ref === "string") ||
    !(message.ref === null || typeof message.ref === "string") ||
    typeof message.topic !== "string" ||
    typeof message.event !== "string" ||
    message.payload === null ||
    typeof message.payload !== "object" ||
    Array.isArray(message.payload)
  )
    fail("Invalid BERT message");
  return message;
};

// Only parsing failures go to onError. Exceptions from the consumer must propagate.
export const decode = (payload, callback, onError) => {
  let message;
  let error;
  let failed = false;
  try {
    message = read(payload);
  } catch (reason) {
    error = reason;
    failed = true;
  }
  data = view = null;
  if (!failed) return callback(message);
  if (!onError) throw error;
  return onError(error);
};

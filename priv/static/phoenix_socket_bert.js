"use strict";

import { decode as bertDecode } from "./bert";
import { Socket } from "phoenix";

const { defaultDecoder } = new Socket();

export const decode = (rawPayload, callback) => {
  try {
    let [join_ref, ref, topic, event, payload] = bertDecode(rawPayload);
    return callback({ join_ref, ref, topic, event, payload });
  } catch (error) {
    return defaultDecoder(rawPayload, callback);
  }
};

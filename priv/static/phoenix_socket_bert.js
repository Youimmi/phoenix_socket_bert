"use strict";

import { decode as bertDecode } from "./bert";

export const decode = (rawPayload, callback) => {
  let [join_ref, ref, topic, event, payload] = bertDecode(rawPayload);
  return callback({ join_ref, ref, topic, event, payload });
};

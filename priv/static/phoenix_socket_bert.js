'use strict'

import * as BERT from './bert'

export const decode = (rawPayload, callback) => {
  const payloadData = rawPayload instanceof ArrayBuffer
    ? BERT.decode(rawPayload)
    : JSON.parse(rawPayload)

  const [join_ref, ref, topic, event, payload] = payloadData
  callback({ join_ref, ref, topic, event, payload })
}

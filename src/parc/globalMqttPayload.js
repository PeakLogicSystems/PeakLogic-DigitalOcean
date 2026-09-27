'use strict';

const { parseMqttJson } = require('./parseMqttJson');

/** Encode a global tag value for MQTT (retained QoS1). */
function encodeGlobalMqttPayload(tagType, value) {
  const t = String(tagType || 'BOOL').toUpperCase();
  const body = { v: value, t };
  if (t === 'BOOL') body.v = !!value;
  else if (t === 'INT') body.v = Math.trunc(Number(value) || 0);
  else if (t === 'REAL') body.v = Number(value) || 0;
  return JSON.stringify(body);
}

/** Decode inbound global MQTT payload → { type, value } or null. */
function decodeGlobalMqttPayload(text) {
  let msg;
  try {
    msg = parseMqttJson(text);
  } catch {
    return null;
  }
  if (msg == null) return null;
  if (typeof msg === 'boolean' || typeof msg === 'number') {
    return {
      type: typeof msg === 'number' ? (Number.isInteger(msg) ? 'INT' : 'REAL') : 'BOOL',
      value: msg,
    };
  }
  if (typeof msg !== 'object') return null;
  const t = String(msg.t || msg.type || 'BOOL').toUpperCase();
  let v = msg.v;
  if (v === undefined && msg.value !== undefined) v = msg.value;
  if (v === undefined) return null;
  if (t === 'BOOL') return { type: 'BOOL', value: !!v };
  if (t === 'INT') return { type: 'INT', value: Math.trunc(Number(v) || 0) };
  if (t === 'REAL') return { type: 'REAL', value: Number(v) || 0 };
  return { type: t, value: v };
}

module.exports = {
  encodeGlobalMqttPayload,
  decodeGlobalMqttPayload,
};

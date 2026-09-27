'use strict';

const DEVICE_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;

function normalizeDeviceId(id) {
  const s = String(id || '').trim();
  if (!s || !DEVICE_ID_RE.test(s)) {
    throw new Error('deviceId must be 1-64 chars: letters, digits, . _ -');
  }
  return s;
}

function topicPrefix(cfg) {
  const p = (cfg?.topicPrefix || 'peaklogic/v1').replace(/\/+$/, '');
  return p;
}

function topics(cfg, deviceId) {
  const id = normalizeDeviceId(deviceId);
  const base = `${topicPrefix(cfg)}/${id}`;
  return {
    telemetry: `${base}/telemetry`,
    online: `${base}/online`,
    config: `${base}/config`,
    cmd: `${base}/cmd`,
    cmdResponse: `${base}/cmd/response`,
    wildcardTelemetry: `${topicPrefix(cfg)}/+/telemetry`,
    wildcardCmdResponse: `${topicPrefix(cfg)}/+/cmd/response`,
    wildcardOnline: `${topicPrefix(cfg)}/+/online`,
    deviceId: id,
  };
}

function deviceIdFromTopic(topic, cfg) {
  const prefix = topicPrefix(cfg) + '/';
  if (!topic.startsWith(prefix)) return null;
  const rest = topic.slice(prefix.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const id = rest.slice(0, slash);
  return DEVICE_ID_RE.test(id) ? id : null;
}

module.exports = {
  normalizeDeviceId,
  topicPrefix,
  topics,
  deviceIdFromTopic,
};

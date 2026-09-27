'use strict';

const { globalTopic, normalizeSiteKey, siteKeyToAddrKey } = require('./globalAddressKey');

const DEVICE_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;
const TENANT_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;

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
  const info = telemetryTopicInfo(topic, cfg);
  if (info?.deviceId) return info.deviceId;

  const prefix = topicPrefix(cfg) + '/';
  if (!topic.startsWith(prefix)) return null;
  const parts = topic.slice(prefix.length).split('/').filter(Boolean);
  if (!parts.length) return null;

  if (parts[parts.length - 1] === 'response' && parts[parts.length - 2] === 'cmd') {
    const idx = parts.length === 3 ? 0 : 1;
    const id = parts[idx];
    return DEVICE_ID_RE.test(id) ? id : null;
  }
  if (parts.length === 2 && (parts[1] === 'online' || parts[1] === 'config' || parts[1] === 'cmd')) {
    return DEVICE_ID_RE.test(parts[0]) ? parts[0] : null;
  }
  return null;
}

/** Parse Parc or tenant-scoped telemetry topic → { deviceId, tenantId? }. */
function telemetryTopicInfo(topic, cfg) {
  const prefix = topicPrefix(cfg) + '/';
  if (!topic.startsWith(prefix) || !topic.endsWith('/telemetry')) return null;
  const rest = topic.slice(prefix.length, -('/telemetry'.length));
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1) {
    const id = parts[0];
    return DEVICE_ID_RE.test(id) ? { deviceId: id, tenantId: null } : null;
  }
  if (parts.length === 2) {
    const tenantId = parts[0];
    const deviceId = parts[1];
    if (!TENANT_ID_RE.test(tenantId) || !DEVICE_ID_RE.test(deviceId)) return null;
    return { tenantId, deviceId };
  }
  return null;
}

const GLOBAL_ADDR_KEY_RE = /^[0-9a-f]{4}$/i;
const GLOBAL_TAG_RE = /^[a-zA-Z0-9._-]{1,64}$/;

/** Parse global tag topic peaklogic/v1/g/{siteKey4}/{tagName}. */
function parseGlobalTopic(topic, cfg) {
  const prefix = `${topicPrefix(cfg)}/g/`;
  if (!topic.startsWith(prefix)) return null;
  const rest = topic.slice(prefix.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const addrKey = rest.slice(0, slash).toLowerCase();
  const tagName = rest.slice(slash + 1);
  if (!GLOBAL_ADDR_KEY_RE.test(addrKey) || !GLOBAL_TAG_RE.test(tagName)) return null;
  return {
    addrKey,
    tagName,
    siteKey: parseInt(addrKey, 16),
  };
}

/** Global P2P tag topics under peaklogic/v1/g/{siteKey4}/{tagName}. */
function globalTopics(cfg, siteKey, tagName) {
  const tag = String(tagName || '').trim();
  if (!tag) throw new Error('tagName required');
  const key = normalizeSiteKey(siteKey);
  const addrKey = siteKeyToAddrKey(key);
  const prefix = topicPrefix(cfg);
  const publish = globalTopic(cfg, key, tag);
  return {
    tag: publish,
    wildcardSiteTags: `${prefix}/g/${addrKey}/+`,
    wildcardAllGlobals: `${prefix}/g/+/+`,
    siteKey: key,
    addrKey,
    tagName: tag,
  };
}

module.exports = {
  normalizeDeviceId,
  topicPrefix,
  topics,
  globalTopics,
  deviceIdFromTopic,
  telemetryTopicInfo,
  parseGlobalTopic,
};

'use strict';

const gatewayCellularStore = require('./gatewayCellularStore');
const simManager = require('./simManager');
const { isCellularSimsEnabled } = require('./cellularSimsEnabled');
const { topicPrefix } = require('../parc/mqttProtocol');
const { parseMqttJson } = require('../parc/parseMqttJson');

const GATEWAY_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;

function gatewayCellularTopic(cfg, gatewayId) {
  const id = String(gatewayId || '').trim();
  if (!id || !GATEWAY_ID_RE.test(id)) return null;
  return `${topicPrefix(cfg)}/gateway/${id}/cellular`;
}

function parseGatewayCellularTopic(topic, cfg) {
  const prefix = `${topicPrefix(cfg)}/gateway/`;
  if (!topic.startsWith(prefix) || !topic.endsWith('/cellular')) return null;
  const gatewayId = topic.slice(prefix.length, -('/cellular'.length));
  if (!GATEWAY_ID_RE.test(gatewayId)) return null;
  return { gatewayId };
}

function normalizeGatewayPayload(body, gatewayId) {
  if (!body || typeof body !== 'object') return null;
  return {
    gatewayId: String(body.gatewayId || gatewayId || '').trim() || gatewayId,
    platform: body.platform || body.gatewayPlatform || 'nanopi-neo-cat1',
    iccid: body.iccid || body.ICCID || body.simIccid || null,
    imsi: body.imsi || body.IMSI || null,
    imei: body.imei || body.IMEI || body.modemImei || null,
    signal: body.signal ?? body.csq ?? body.modemSignal ?? null,
    reportedAt: body.reportedAt || body.timestamp || null,
    tenantId: body.tenantId || null,
    deviceId: body.deviceId || null,
  };
}

async function ingestGatewayCellularMessage(topic, text, cfg = {}) {
  if (!isCellularSimsEnabled()) {
    return { ok: false, skipped: true, reason: 'cellular sims disabled' };
  }
  const parsed = parseGatewayCellularTopic(topic, cfg);
  if (!parsed) {
    return { ok: false, skipped: true, reason: 'not a gateway cellular topic' };
  }
  let body;
  try {
    body = parseMqttJson(text);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
  const payload = normalizeGatewayPayload(body, parsed.gatewayId);
  if (!payload) {
    return { ok: false, error: 'invalid gateway cellular payload' };
  }

  const autoLink = await simManager.autoLinkFromGateway({
    gatewayId: payload.gatewayId,
    iccid: payload.iccid,
    imsi: payload.imsi,
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
  });

  let deviceSync = null;
  try {
    const { syncGatewayLanDevices } = require('./deviceCellularSync');
    deviceSync = await syncGatewayLanDevices(payload.gatewayId);
  } catch {
    deviceSync = null;
  }

  const report = gatewayCellularStore.upsertReport({
    ...payload,
    autoLink,
  });

  return { ok: true, report, autoLink, deviceSync };
}

module.exports = {
  GATEWAY_ID_RE,
  gatewayCellularTopic,
  parseGatewayCellularTopic,
  normalizeGatewayPayload,
  ingestGatewayCellularMessage,
};

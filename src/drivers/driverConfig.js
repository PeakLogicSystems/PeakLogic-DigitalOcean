'use strict';

/** Drop connection fields that do not apply to the driver type (e.g. stray COM on API drivers). */
function sanitizeDriverConfig(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const d = { ...raw };
  const t = String(d.type || 'mock');

  const keep = new Set(['id', 'type', 'enabled']);

  switch (t) {
    case 'modbus_rtu':
    case 'vgreen_epc':
    case 'pentair_rs485':
    case 'jandy_rs485':
      ['serialPort', 'baud', 'slaveId', 'deviceAddr', 'deviceClass', 'parity', 'stopBits', 'timeoutMs', 'pollIntervalMs', 'frameDelayMs', 'busGapMs'].forEach((k) => keep.add(k));
      break;
    case 'hayward_rs485':
      ['serialPort', 'baud', 'slaveId', 'deviceAddr', 'hua', 'deviceClass', 'parity', 'stopBits', 'timeoutMs', 'pollIntervalMs', 'frameDelayMs', 'keepaliveMs', 'maxRpm', 'useSimpleFrames'].forEach((k) => keep.add(k));
      break;
    case 'modbus_tcp':
      ['host', 'port', 'slaveId', 'timeoutMs', 'pollIntervalMs'].forEach((k) => keep.add(k));
      break;
    case 'modbus_bridge':
      ['serialPort', 'baud', 'listenPort', 'rtu', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
    case 'serial':
      ['port', 'baud', 'profile', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
    case 'mqtt':
      ['brokerUrl', 'broker', 'clientId', 'subscriptions', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
    case 'https':
      ['baseUrl', 'url', 'pollIntervalMs', 'bearerToken', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
    case 'nextcentury':
      ['email', 'password', 'reportId', 'pollIntervalMs', 'propertyIds', 'propertyDelayMs', 'autoSyncTags', 'devicesPerSite', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
    case 'opta_remote':
      ['host', 'port', 'scanMs', 'bearerToken', 'deviceId', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
    case 'mqtt_parc':
      ['deviceId', 'scanMs', 'reportIntervalSec', 'ateccSerial', 'name', 'vendor', 'model', 'platform', 'hardwareHistory', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
    case 'hal':
      ['backend', 'pluginPath', 'halConfig', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
    case 'native_so':
      ['library', 'timeoutMs'].forEach((k) => keep.add(k));
      break;
  }

  const out = {};
  for (const k of keep) {
    if (d[k] !== undefined) out[k] = d[k];
  }
  if (out.enabled === undefined) out.enabled = d.enabled !== false;
  return out;
}

function driverUsesSerialPort(type) {
  return type === 'modbus_rtu' || type === 'vgreen_epc' || type === 'pentair_rs485'
    || type === 'jandy_rs485' || type === 'hayward_rs485' || type === 'modbus_bridge' || type === 'serial';
}

function isBlankSecret(value) {
  const s = String(value ?? '').trim();
  return !s || /^•+$/.test(s) || s === '********';
}

/** Keep stored secrets when the client omits or masks them (e.g. blank password field on save). */
function mergeDriverSecrets(incoming, existingList) {
  if (!Array.isArray(incoming)) return incoming;
  const byId = new Map((existingList || []).map((d) => [d.id, d]));
  return incoming.map((d) => {
    const prev = byId.get(d.id);
    if (!prev) return d;
    const out = { ...d };
    if (out.type === 'nextcentury' || prev.type === 'nextcentury') {
      if (isBlankSecret(out.password) && prev.password) out.password = prev.password;
    }
    if ((out.type === 'https' || prev.type === 'https') && isBlankSecret(out.bearerToken) && prev.bearerToken) {
      out.bearerToken = prev.bearerToken;
    }
    return out;
  });
}

function publicDriverRow(d) {
  if (!d || typeof d !== 'object') return d;
  if (d.type === 'nextcentury') {
    const { password, ...rest } = d;
    return { ...rest, hasPassword: Boolean(password) };
  }
  if (d.type === 'https' && d.bearerToken) {
    const { bearerToken, ...rest } = d;
    return { ...rest, hasBearerToken: true };
  }
  return d;
}

function publicDriverList(list) {
  return (list || []).map(publicDriverRow);
}

module.exports = {
  sanitizeDriverConfig,
  driverUsesSerialPort,
  mergeDriverSecrets,
  isBlankSecret,
  publicDriverRow,
  publicDriverList,
};

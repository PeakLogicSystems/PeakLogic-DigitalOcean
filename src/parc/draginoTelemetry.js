'use strict';

const { topicPrefix } = require('./mqttProtocol');

const DRAGINO_MODEL_RE = /RS485/i;
/** Dragino RS485-NB/NS JSON uplink (AT+PRO=3,5). */
function isDraginoPayload(body) {
  if (!body || typeof body !== 'object') return false;
  if (DRAGINO_MODEL_RE.test(String(body.Model || ''))) return true;
  return !!(body.IMEI && (body.Payload != null || body.payload != null));
}

function defaultDraginoSettings(cfg = {}) {
  const d = cfg?.dragino && typeof cfg.dragino === 'object' ? cfg.dragino : {};
  return {
    enabled: d.enabled !== false,
    topicPrefix: String(d.topicPrefix || 'dragino').replace(/\/+$/, '') || 'dragino',
    topicSuffix: String(d.topicSuffix || 'uplink').replace(/^\/+/, '') || 'uplink',
    deviceIdPrefix: String(d.deviceIdPrefix || 'dragino_').trim() || 'dragino_',
    cloudTenantId: String(d.cloudTenantId || '').trim(),
  };
}

/** MQTT publish topics for Dragino AT+PUBTOPIC / AT+SUBTOPIC (direct to PeakLogic cloud). */
function draginoCloudMqttTopics(cfg, deviceId, tenantId) {
  const id = String(deviceId || '').trim();
  const tenant = String(tenantId || '').trim();
  const base = topicPrefix(cfg || {});
  if (tenant) {
    return {
      pubTopic: `${base}/${tenant}/${id}/telemetry`,
      subTopic: `${base}/${tenant}/${id}/downlink`,
      flat: false,
    };
  }
  return {
    pubTopic: `${base}/${id}/telemetry`,
    subTopic: `${base}/${id}/downlink`,
    flat: true,
  };
}

function enrichDraginoReportForCloud(report, opts = {}) {
  const tenantId = String(opts.tenantId || '').trim();
  if (!tenantId) return report;
  return {
    ...report,
    meta: {
      ...(report.meta || {}),
      tenantId,
      source: 'dragino-rs485-nb',
      gatewayRole: 'cellular_rs485',
    },
  };
}

/** dragino/{segment}/uplink → { segment, deviceId } */
function parseDraginoTopic(topic, cfg) {
  const dragino = defaultDraginoSettings(cfg);
  if (dragino.enabled === false) return null;
  const prefix = `${dragino.topicPrefix}/`;
  const suffix = `/${dragino.topicSuffix}`;
  if (!topic.startsWith(prefix) || !topic.endsWith(suffix)) return null;
  const middle = topic.slice(prefix.length, -suffix.length);
  if (!middle || middle.includes('/')) return null;
  const segment = middle.trim();
  if (!/^[a-zA-Z0-9._-]{1,48}$/.test(segment)) return null;
  const deviceId = `${dragino.deviceIdPrefix}${segment}`;
  return { segment, deviceId };
}

function draginoSubscribePattern(cfg) {
  const dragino = defaultDraginoSettings(cfg);
  if (dragino.enabled === false) return null;
  return `${dragino.topicPrefix}/+/${dragino.topicSuffix}`;
}

function hexToBuffer(hex) {
  const clean = String(hex || '').replace(/\s+/g, '').toLowerCase();
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) return null;
  return Buffer.from(clean, 'hex');
}

/** Parse Modbus RTU FC01–04 style responses embedded in Dragino Payload hex. */
function modbusRegistersFromHex(hex) {
  const buf = hexToBuffer(hex);
  if (!buf || buf.length < 4) return [];

  const tags = [];
  let offset = 0;
  let regIndex = 0;

  while (offset + 3 <= buf.length) {
    const fc = buf[offset + 1];
    if (fc !== 0x01 && fc !== 0x02 && fc !== 0x03 && fc !== 0x04) {
      offset += 1;
      continue;
    }
    const byteCount = buf[offset + 2];
    const dataStart = offset + 3;
    const dataEnd = dataStart + byteCount;
    if (byteCount <= 0 || dataEnd > buf.length) break;

    if (fc === 0x03 || fc === 0x04) {
      for (let i = dataStart; i + 1 < dataEnd; i += 2) {
        regIndex += 1;
        tags.push({
          id: `MB_REG_${regIndex}`,
          type: 'INT',
          role: 'input',
          value: buf.readUInt16BE(i),
          quality: 'GOOD',
        });
      }
    } else {
      for (let bit = 0; bit < byteCount * 8; bit += 1) {
        regIndex += 1;
        const byte = buf[dataStart + Math.floor(bit / 8)];
        const val = ((byte >> (bit % 8)) & 1) === 1;
        tags.push({
          id: `MB_BIT_${regIndex}`,
          type: 'BOOL',
          role: 'input',
          value: val,
          quality: 'GOOD',
        });
      }
    }
    offset = dataEnd;
  }

  if (!tags.length && buf.length >= 2) {
    for (let i = 0; i + 1 < buf.length; i += 2) {
      tags.push({
        id: `MB_REG_${(i / 2) + 1}`,
        type: 'INT',
        role: 'input',
        value: buf.readUInt16BE(i),
        quality: 'GOOD',
      });
    }
  }
  return tags;
}

function normalizeDraginoPayload(body) {
  const raw = body.Payload ?? body.payload ?? '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] || '';
  return String(raw || '');
}

/** Convert Dragino JSON uplink → PeakLogic Parc v1 telemetry report. */
function draginoToParcReport(body, deviceId, opts = {}) {
  if (!body || typeof body !== 'object') {
    throw new Error('Dragino body required');
  }
  const id = String(deviceId || body.deviceId || '').trim()
    || (body.IMEI ? `dragino_${String(body.IMEI).slice(-8)}` : '');
  if (!id) throw new Error('deviceId required for Dragino ingest');

  const tags = [];
  if (body.signal != null) {
    tags.push({
      id: 'CELL_SIGNAL',
      type: 'INT',
      role: 'input',
      value: Math.trunc(Number(body.signal) || 0),
      quality: 'GOOD',
    });
  }
  if (body.battery != null) {
    tags.push({
      id: 'CELL_BATTERY_V',
      type: 'REAL',
      role: 'input',
      value: Number(body.battery) || 0,
      quality: 'GOOD',
    });
  }

  const payloadHex = normalizeDraginoPayload(body);
  const modbusMap = opts.modbusMap || null;
  if (payloadHex) {
    let mapped = [];
    if (modbusMap?.tags?.length) {
      const { decodeTagsFromModbusMap } = require('./draginoModbusMap');
      mapped = decodeTagsFromModbusMap(payloadHex, modbusMap);
    } else {
      const { loadDraginoModbusMapForDevice, decodeTagsFromModbusMap } = require('./draginoModbusMap');
      const stored = loadDraginoModbusMapForDevice(id);
      if (stored?.tags?.length) mapped = decodeTagsFromModbusMap(payloadHex, stored);
    }
    if (mapped.length) tags.push(...mapped);
    else tags.push(...modbusRegistersFromHex(payloadHex));
  }

  const resolvedMap = modbusMap || (() => {
    const { loadDraginoModbusMapForDevice } = require('./draginoModbusMap');
    return loadDraginoModbusMapForDevice(id);
  })();

  const reportIntervalSec = body.reportIntervalSec != null
    ? Math.max(30, Math.trunc(Number(body.reportIntervalSec) || 300))
    : undefined;

  const report = {
    deviceId: id,
    name: body.name || body.Model || 'Dragino RS485-NB',
    platform: 'dragino-rs485-nb',
    reportIntervalSec,
    modbusPreset: resolvedMap?.presetId || null,
    dragino: {
      imei: body.IMEI || null,
      imsi: body.IMSI || null,
      model: body.Model || null,
      payloadHex: payloadHex || null,
      time: body.time || null,
    },
    tags,
  };
  return enrichDraginoReportForCloud(report, opts);
}

module.exports = {
  isDraginoPayload,
  defaultDraginoSettings,
  parseDraginoTopic,
  draginoSubscribePattern,
  draginoCloudMqttTopics,
  enrichDraginoReportForCloud,
  draginoToParcReport,
  modbusRegistersFromHex,
  hexToBuffer,
};

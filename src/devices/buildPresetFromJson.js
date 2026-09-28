'use strict';

const fs = require('fs');
const path = require('path');
const { ST_DIR } = require('../config');
const {
  diTags, doTags, holdingRegTags, inputRegTags, explicitModbusTags, explicitVgreenTags, explicitPentairTags,
  explicitJandyTags, explicitHaywardTags, scanConcubeParameterTags,
  optaExpansionTags, edgepointGatewayTags, edgepointEventsTopic,
  haloMqttTags, haloTelemetryTopic, halowMqttTags, halowTelemetryTopic, envTelemetryTopic, bme688MqttTags, nexcommTelemetryTopic,
} = require('./tagBuilders');

const FIXTURE_DIR = path.join(ST_DIR, 'fixtures');

/** Load tag rows from one or more st/fixtures/*.json files and bind them to the driver. */
function fixtureTags(driverId, fixture) {
  const names = Array.isArray(fixture) ? fixture : [fixture];
  const out = [];
  for (const name of names) {
    if (!name) continue;
    const fp = path.join(FIXTURE_DIR, String(name));
    if (!fs.existsSync(fp)) continue;
    let arr;
    try {
      arr = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      if (t && typeof t === 'object' && t.id) out.push({ ...t, driverId });
    }
  }
  return out;
}

const NEXCOMM_MQTT_BLOCKS = [
  { key: 'halo', defaultPrefix: 'nexcomm/halo' },
  { key: 'halow', defaultPrefix: 'nexcomm/halow' },
  { key: 'bme688', defaultPrefix: 'nexcomm/env' },
];

function resolveNexcommMqttTopic(tagsSpec, opts, defs) {
  const mqttDeviceId = opts.deviceId || defs.deviceId
    || NEXCOMM_MQTT_BLOCKS.map(({ key }) => tagsSpec?.[key]?.deviceId).find(Boolean)
    || '';
  if (!mqttDeviceId) return null;
  for (const { key, defaultPrefix } of NEXCOMM_MQTT_BLOCKS) {
    const block = tagsSpec?.[key];
    if (!block) continue;
    return nexcommTelemetryTopic(
      mqttDeviceId,
      opts.topicPrefix || block.topicPrefix || defs.topicPrefix || defaultPrefix,
    );
  }
  return null;
}

/** Shared RS-485 bus (multi-slave DI/Q) vs dedicated driver row (explicit register map). */
function inferSharedBus(tagsSpec, explicit) {
  if (explicit !== undefined) return explicit !== false;
  const hasChannel = (tagsSpec.discrete || []).length > 0
    || (tagsSpec.coil || []).length > 0
    || (tagsSpec.input || []).length > 0
    || (tagsSpec.holding || []).length > 0;
  if (((tagsSpec.explicit || []).length > 0 || (tagsSpec.vgreen || []).length > 0
      || (tagsSpec.pentair || []).length > 0 || (tagsSpec.jandy || []).length > 0
      || (tagsSpec.hayward || []).length > 0) && !hasChannel) return false;
  if (tagsSpec.concube && !hasChannel) return false;
  return true;
}

/**
 * Build a device preset from a JSON template (see templates/*.json).
 * @param {object} spec
 */
function buildPresetFromJson(spec) {
  if (!spec?.id || !spec.label || !spec.transport) {
    throw new Error('Device template JSON requires id, label, and transport');
  }

  const driverIdDefault = spec.driverId || spec.id;

  const sharedBus = inferSharedBus(spec.tags || {}, spec.sharedBus);

  const concube = spec.tags?.concube || null;

  return {
    id: spec.id,
    label: spec.label,
    vendor: spec.vendor || '',
    model: spec.model || '',
    transport: spec.transport,
    sharedBus,
    concube,
    diCount: spec.diCount,
    doCount: spec.doCount,
    aiCount: spec.aiCount,
    hrCount: spec.hrCount,
    tagsFromDevice: spec.tagsFromDevice === true,
    stProgram: spec.stProgram || spec.defaultProgram || '',
    stProgramLabel: spec.stProgramLabel || '',
    stationType: spec.stationType || '',
    pdm: spec.pdm || undefined,
    defaults: spec.defaults || {},
    driver: (opts) => {
      const id = opts.driverId || driverIdDefault;
      const d = spec.driver || {};
      if (spec.transport === 'modbus_tcp') {
        return {
          id,
          type: 'modbus_tcp',
          enabled: d.enabled !== false,
          host: opts.host || d.host || '127.0.0.1',
          port: opts.port ?? d.port ?? 502,
          slaveId: opts.slaveId ?? d.slaveId ?? 1,
          timeoutMs: d.timeoutMs ?? 1000,
        };
      }
      if (spec.transport === 'vgreen_epc') {
        return {
          id,
          type: 'vgreen_epc',
          enabled: d.enabled !== false,
          serialPort: opts.serialPort || d.serialPort || 'COM3',
          baud: opts.baud ?? d.baud ?? 19200,
          slaveId: opts.slaveId ?? d.slaveId ?? 21,
          parity: opts.parity || d.parity || 'none',
          stopBits: opts.stopBits ?? d.stopBits ?? 1,
          timeoutMs: d.timeoutMs ?? 2000,
          pollIntervalMs: opts.pollIntervalMs ?? d.pollIntervalMs ?? spec.defaults?.pollIntervalMs ?? 0,
        };
      }
      if (spec.transport === 'pentair_rs485') {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'pentair_rs485',
          enabled: d.enabled !== false,
          serialPort: opts.serialPort || d.serialPort || defs.serialPort || 'COM3',
          baud: opts.baud ?? d.baud ?? defs.baud ?? 9600,
          deviceAddr: opts.deviceAddr ?? opts.slaveId ?? d.deviceAddr ?? d.slaveId ?? defs.deviceAddr ?? 0x70,
          deviceClass: opts.deviceClass || d.deviceClass || defs.deviceClass || 'ultratemp',
          parity: opts.parity || d.parity || defs.parity || 'none',
          stopBits: opts.stopBits ?? d.stopBits ?? defs.stopBits ?? 1,
          timeoutMs: d.timeoutMs ?? defs.timeoutMs ?? 2000,
          pollIntervalMs: opts.pollIntervalMs ?? d.pollIntervalMs ?? defs.pollIntervalMs ?? 300000,
          frameDelayMs: opts.frameDelayMs ?? d.frameDelayMs ?? defs.frameDelayMs ?? 30,
        };
      }
      if (spec.transport === 'jandy_rs485') {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'jandy_rs485',
          enabled: d.enabled !== false,
          serialPort: opts.serialPort || d.serialPort || defs.serialPort || 'COM3',
          baud: opts.baud ?? d.baud ?? defs.baud ?? 9600,
          deviceAddr: opts.deviceAddr ?? opts.slaveId ?? d.deviceAddr ?? d.slaveId ?? defs.deviceAddr ?? 0x78,
          deviceClass: opts.deviceClass || d.deviceClass || defs.deviceClass || 'epump',
          parity: opts.parity || d.parity || defs.parity || 'none',
          stopBits: opts.stopBits ?? d.stopBits ?? defs.stopBits ?? 1,
          timeoutMs: d.timeoutMs ?? defs.timeoutMs ?? 2000,
          pollIntervalMs: opts.pollIntervalMs ?? d.pollIntervalMs ?? defs.pollIntervalMs ?? 60000,
          frameDelayMs: opts.frameDelayMs ?? d.frameDelayMs ?? defs.frameDelayMs ?? 30,
          busGapMs: opts.busGapMs ?? d.busGapMs ?? defs.busGapMs ?? 120,
        };
      }
      if (spec.transport === 'hayward_rs485') {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'hayward_rs485',
          enabled: d.enabled !== false,
          serialPort: opts.serialPort || d.serialPort || defs.serialPort || 'COM3',
          baud: opts.baud ?? d.baud ?? defs.baud ?? 19200,
          deviceAddr: opts.deviceAddr ?? opts.hua ?? opts.slaveId ?? d.deviceAddr ?? d.hua ?? defs.deviceAddr ?? 0,
          deviceClass: opts.deviceClass || d.deviceClass || defs.deviceClass || 'vs_pump',
          parity: opts.parity || d.parity || defs.parity || 'none',
          stopBits: opts.stopBits ?? d.stopBits ?? defs.stopBits ?? 2,
          timeoutMs: d.timeoutMs ?? defs.timeoutMs ?? 2000,
          pollIntervalMs: opts.pollIntervalMs ?? d.pollIntervalMs ?? defs.pollIntervalMs ?? 5000,
          frameDelayMs: opts.frameDelayMs ?? d.frameDelayMs ?? defs.frameDelayMs ?? 30,
          keepaliveMs: opts.keepaliveMs ?? d.keepaliveMs ?? defs.keepaliveMs ?? 1000,
          maxRpm: opts.maxRpm ?? d.maxRpm ?? defs.maxRpm ?? 3450,
          useSimpleFrames: opts.useSimpleFrames ?? d.useSimpleFrames ?? defs.useSimpleFrames !== false,
        };
      }
      if (spec.transport === 'opta_remote' || spec.transport === 'mqtt_parc'
          || spec.transport === 'mqtt_parc_telemetry') {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'mqtt_parc',
          enabled: d.enabled !== false,
          deviceId: opts.deviceId || d.deviceId || defs.deviceId || id,
          remoteExecution: opts.remoteExecution ?? d.remoteExecution ?? defs.remoteExecution !== false,
          scanMs: opts.scanMs ?? d.scanMs ?? defs.scanMs ?? 100,
          reportIntervalMs: opts.reportIntervalMs
            ?? d.reportIntervalMs
            ?? (defs.reportIntervalSec != null ? defs.reportIntervalSec * 1000 : defs.reportIntervalMs)
            ?? 200,
        };
      }
      if (spec.transport === 'nextcentury') {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'nextcentury',
          enabled: d.enabled !== false,
          email: opts.email || d.email || '',
          password: opts.password || d.password || '',
          reportId: opts.reportId || d.reportId || defs.reportId || 'rt_4510',
          pollIntervalMs: opts.pollIntervalMs ?? d.pollIntervalMs ?? defs.pollIntervalMs ?? 900000,
          propertyIds: opts.propertyIds ?? d.propertyIds ?? defs.propertyIds,
          propertyDelayMs: opts.propertyDelayMs ?? d.propertyDelayMs ?? defs.propertyDelayMs ?? 600,
          autoSyncTags: opts.autoSyncTags ?? d.autoSyncTags ?? defs.autoSyncTags !== false,
          timeoutMs: d.timeoutMs ?? 20000,
        };
      }
      if (spec.transport === 'mqtt') {
        const defs = spec.defaults || {};
        const tagsSpec = spec.tags || {};
        const serialNum = opts.serialNum || d.serialNum || defs.serialNum || '';
        const mqttDeviceId = opts.deviceId || d.deviceId || defs.deviceId
          || NEXCOMM_MQTT_BLOCKS.map(({ key }) => tagsSpec[key]?.deviceId).find(Boolean)
          || '';
        const eventsTopic = serialNum ? edgepointEventsTopic(serialNum) : null;
        const nexcommTopic = resolveNexcommMqttTopic(tagsSpec, opts, defs);
        const subscriptions = opts.subscriptions || d.subscriptions || defs.subscriptions;
        return {
          id,
          type: 'mqtt',
          enabled: d.enabled !== false,
          brokerUrl: opts.brokerUrl || opts.broker || d.brokerUrl || d.broker || defs.brokerUrl || 'mqtt://127.0.0.1:1883',
          clientId: opts.clientId || d.clientId || defs.clientId || 'peaklogic',
          username: opts.username || d.username || defs.username,
          password: opts.password || d.password || defs.password,
          subscribeQos: opts.subscribeQos ?? d.subscribeQos ?? defs.subscribeQos ?? 0,
          publishQos: opts.publishQos ?? d.publishQos ?? defs.publishQos ?? 0,
          subscriptions: subscriptions || (eventsTopic ? [eventsTopic] : nexcommTopic ? [nexcommTopic] : undefined),
          serialNum: serialNum || undefined,
          deviceId: mqttDeviceId || undefined,
          timeoutMs: d.timeoutMs ?? 10000,
        };
      }
      if (spec.transport === 'https') {
        return {
          id,
          type: 'https',
          enabled: d.enabled !== false,
          baseUrl: opts.baseUrl || opts.url || d.baseUrl || d.url || 'https://127.0.0.1',
          pollIntervalMs: opts.pollIntervalMs ?? d.pollIntervalMs ?? 0,
          bearerToken: opts.bearerToken || d.bearerToken || '',
          timeoutMs: d.timeoutMs ?? 10000,
        };
      }
      if (spec.transport === 'hal') {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'hal',
          enabled: d.enabled !== false,
          backend: opts.backend || d.backend || defs.backend || 'sim',
          pluginPath: opts.pluginPath || d.pluginPath || defs.pluginPath || '',
          halConfig: opts.halConfig || d.halConfig || {
            stack: opts.stack ?? defs.stack ?? 0,
            i2cBus: opts.i2cBus ?? defs.i2cBus ?? 1,
          },
          timeoutMs: d.timeoutMs ?? 1000,
        };
      }
      {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'modbus_rtu',
          enabled: d.enabled !== false,
          serialPort: opts.serialPort || d.serialPort || defs.serialPort || 'COM3',
          baud: opts.baud ?? d.baud ?? defs.baud ?? 9600,
          slaveId: opts.slaveId ?? d.slaveId ?? defs.slaveId ?? 1,
          parity: opts.parity || d.parity || defs.parity || 'none',
          stopBits: opts.stopBits ?? d.stopBits ?? defs.stopBits ?? 1,
          timeoutMs: d.timeoutMs ?? defs.timeoutMs ?? 1000,
          pollIntervalMs: opts.pollIntervalMs ?? d.pollIntervalMs ?? defs.pollIntervalMs ?? 0,
          frameDelayMs: opts.frameDelayMs ?? d.frameDelayMs ?? defs.frameDelayMs ?? 0,
        };
      }
    },
    tags: (opts) => buildTagsFromSpec(opts.driverId || driverIdDefault, spec.tags || {}, opts),
  };
}

function buildTagsFromSpec(driverId, tagsSpec, applyOpts = {}) {
  const out = [];
  if (tagsSpec.fixture) {
    out.push(...fixtureTags(driverId, tagsSpec.fixture));
  }
  for (const block of tagsSpec.discrete || []) {
    out.push(...diTags(driverId, block.count ?? 8, block.prefix || 'DI', block.start ?? 0));
  }
  for (const block of tagsSpec.coil || []) {
    out.push(...doTags(driverId, block.count ?? 8, block.prefix || 'Q', block.start ?? 0));
  }
  for (const block of tagsSpec.input || []) {
    out.push(...inputRegTags(
      driverId,
      block.count ?? 8,
      block.start ?? 0,
      block.prefix || 'AI',
      block.suffix || ''
    ));
  }
  for (const block of tagsSpec.holding || []) {
    out.push(...holdingRegTags(driverId, block.count ?? 8, block.start ?? 0, block.prefix || 'H'));
  }
  out.push(...explicitModbusTags(driverId, tagsSpec.explicit));
  out.push(...explicitVgreenTags(driverId, tagsSpec.vgreen));
  out.push(...explicitPentairTags(driverId, tagsSpec.pentair));
  out.push(...explicitJandyTags(driverId, tagsSpec.jandy));
  out.push(...explicitHaywardTags(driverId, tagsSpec.hayward));
  if (tagsSpec.concube) {
    const perGroup = tagsSpec.concube.paramsPerGroup ?? 4;
    const groups = Math.max(1, Math.min(16, Number(applyOpts.paramGroups) || tagsSpec.concube.defaultGroups || 1));
    const paramCount = Number(applyOpts.paramCount) || (groups * perGroup);
    const paramStart = Math.max(1, Number(applyOpts.paramStart) || 1);
    const includeSystemTags = applyOpts.includeSystemTags === true;
    out.push(...scanConcubeParameterTags(driverId, {
      paramStart,
      paramCount,
      includeSystemTags,
    }));
  }
  if (Array.isArray(tagsSpec.expansions) && tagsSpec.expansions.length) {
    out.push(...optaExpansionTags(driverId, tagsSpec.expansions));
  }
  if (tagsSpec.edgepoint) {
    const serialNum = applyOpts.serialNum || tagsSpec.edgepoint.serialNum;
    out.push(...edgepointGatewayTags(driverId, serialNum, tagsSpec.edgepoint));
  }
  if (tagsSpec.halo) {
    const deviceId = applyOpts.deviceId || tagsSpec.halo.deviceId;
    out.push(...haloMqttTags(driverId, deviceId, tagsSpec.halo));
  }
  if (tagsSpec.halow) {
    const deviceId = applyOpts.deviceId || tagsSpec.halow.deviceId;
    out.push(...halowMqttTags(driverId, deviceId, tagsSpec.halow));
  }
  if (tagsSpec.bme688) {
    const deviceId = applyOpts.deviceId || tagsSpec.bme688.deviceId;
    out.push(...bme688MqttTags(driverId, deviceId, tagsSpec.bme688));
  }
  return out;
}

module.exports = { buildPresetFromJson, buildTagsFromSpec };

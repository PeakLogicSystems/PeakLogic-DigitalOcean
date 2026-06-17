'use strict';

const {
  diTags, doTags, holdingRegTags, inputRegTags, explicitModbusTags,
} = require('./tagBuilders');

/** Shared RS-485 bus (multi-slave DI/Q) vs dedicated driver row (explicit register map). */
function inferSharedBus(tagsSpec, explicit) {
  if (explicit !== undefined) return explicit !== false;
  const hasChannel = (tagsSpec.discrete || []).length > 0
    || (tagsSpec.coil || []).length > 0
    || (tagsSpec.input || []).length > 0
    || (tagsSpec.holding || []).length > 0;
  if ((tagsSpec.explicit || []).length > 0 && !hasChannel) return false;
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

  return {
    id: spec.id,
    label: spec.label,
    vendor: spec.vendor || '',
    model: spec.model || '',
    transport: spec.transport,
    sharedBus,
    diCount: spec.diCount,
    doCount: spec.doCount,
    aiCount: spec.aiCount,
    hrCount: spec.hrCount,
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
      if (spec.transport === 'opta_remote') {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'opta_remote',
          enabled: d.enabled !== false,
          host: opts.host || d.host || defs.host || '192.168.1.50',
          port: opts.port ?? d.port ?? defs.port ?? 80,
          remoteExecution: opts.remoteExecution ?? d.remoteExecution ?? defs.remoteExecution !== false,
          scanMs: opts.scanMs ?? d.scanMs ?? defs.scanMs ?? 100,
          timeoutMs: d.timeoutMs ?? 8000,
        };
      }
      if (spec.transport === 'mqtt_fleet') {
        const defs = spec.defaults || {};
        return {
          id,
          type: 'mqtt_fleet',
          enabled: d.enabled !== false,
          deviceId: opts.deviceId || d.deviceId || defs.deviceId || 'opta_st_01',
          remoteExecution: opts.remoteExecution ?? d.remoteExecution ?? defs.remoteExecution !== false,
          scanMs: opts.scanMs ?? d.scanMs ?? defs.scanMs ?? 100,
          reportIntervalSec: opts.reportIntervalSec ?? d.reportIntervalSec ?? defs.reportIntervalSec ?? 180,
        };
      }
      return {
        id,
        type: 'modbus_rtu',
        enabled: d.enabled !== false,
        serialPort: opts.serialPort || d.serialPort || 'COM3',
        baud: opts.baud ?? d.baud ?? 9600,
        slaveId: opts.slaveId ?? d.slaveId ?? 1,
        parity: opts.parity || d.parity || 'none',
        stopBits: opts.stopBits ?? d.stopBits ?? 1,
        timeoutMs: d.timeoutMs ?? 1000,
      };
    },
    tags: (opts) => buildTagsFromSpec(opts.driverId || driverIdDefault, spec.tags || {}),
  };
}

function buildTagsFromSpec(driverId, tagsSpec) {
  const out = [];
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
  return out;
}

module.exports = { buildPresetFromJson, buildTagsFromSpec };

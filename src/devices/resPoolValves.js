'use strict';

/**
 * Res-Pool-Link ESP32 4-valve backwash controller (MQTT Parc remote I/O).
 * R1 inlet · R2 outlet · R3 waste · R4 spare.
 * ST coils BW_VALVE_FILTER / BW_VALVE_BW / BW_VALVE_RINSE select the mode.
 */

const DEFAULT_DEVICE_ID = 'res_pool_valves';

const VALVE_CHANNELS = [
  { tagId: 'FILT_INLET', channel: 'R1', label: 'Filter inlet valve' },
  { tagId: 'FILT_OUTLET', channel: 'R2', label: 'Filter outlet valve' },
  { tagId: 'BW_WASTE', channel: 'R3', label: 'Filter backwash waste valve' },
  { tagId: 'BW_SPARE', channel: 'R4', label: 'Spare valve' },
];

const ST_MODE_CHANNELS = [
  { tagId: 'BW_VALVE_FILTER', channel: 'BW_VALVE_FILTER', label: 'ST filter position' },
  { tagId: 'BW_VALVE_BW', channel: 'BW_VALVE_BW', label: 'ST backwash position' },
  { tagId: 'BW_VALVE_RINSE', channel: 'BW_VALVE_RINSE', label: 'ST rinse position' },
];

function valveDeviceId(env = process.env) {
  const raw = String(env.PEAKLOGIC_POOL_ESP32_VALVES_DEVICE_ID || DEFAULT_DEVICE_ID).trim();
  return raw.replace(/[^A-Za-z0-9_-]/g, '_') || DEFAULT_DEVICE_ID;
}

function buildResPoolValveDriver(env = process.env) {
  const deviceId = valveDeviceId(env);
  return {
    id: deviceId,
    type: 'mqtt_parc',
    enabled: true,
    deviceId,
    remoteExecution: false,
    scanMs: 100,
    reportIntervalMs: 2000,
    platform: 'esp32-res-pool-link',
    comment: 'ESP32 Res-Pool-Link — filter inlet/outlet/waste/spare',
  };
}

function bindResPoolValves(byId, driverId) {
  for (const spec of [...VALVE_CHANNELS, ...ST_MODE_CHANNELS]) {
    const existing = byId.get(spec.tagId);
    const next = existing
      ? { ...existing }
      : {
        id: spec.tagId,
        type: 'BOOL',
        role: 'output',
        value: spec.tagId === 'BW_VALVE_FILTER',
      };
    next.driverId = driverId;
    next.driverAddress = { ...(next.driverAddress || {}), channel: spec.channel };
    next.comment = `ESP32 ${driverId} — ${spec.label}`;
    if (!next.label) next.label = spec.label;
    byId.set(spec.tagId, next);
  }
}

module.exports = {
  DEFAULT_DEVICE_ID,
  VALVE_CHANNELS,
  ST_MODE_CHANNELS,
  valveDeviceId,
  buildResPoolValveDriver,
  bindResPoolValves,
};

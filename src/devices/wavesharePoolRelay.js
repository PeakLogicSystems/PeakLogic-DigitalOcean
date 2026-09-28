'use strict';

/**
 * Waveshare ESP32-S3-Relay-1CH-U — one DIN-rail satellite per pool load.
 * Bind pool ST tags to mqtt_parc drivers (channel R1 / I1).
 */

const POOL_RELAY_ROLES = {
  dose_acid: { tagId: 'DOSE_ACID', channel: 'R1', io: 'output', label: 'Acid dose pump' },
  dose_base: { tagId: 'DOSE_BASE', channel: 'R1', io: 'output', label: 'Base dose pump' },
  dose_cl: { tagId: 'DOSE_CL', channel: 'R1', io: 'output', label: 'Chlorine dose pump' },
  dose_salt: { tagId: 'DOSE_SALT', channel: 'R1', io: 'output', label: 'Salt brine dose' },
  light_z1: { tagId: 'LIGHT_Z1', channel: 'R1', io: 'output', label: 'Light zone 1' },
  light_z2: { tagId: 'LIGHT_Z2', channel: 'R1', io: 'output', label: 'Light zone 2' },
  light_z3: { tagId: 'LIGHT_Z3', channel: 'R1', io: 'output', label: 'Light zone 3' },
  light_z4: { tagId: 'LIGHT_Z4', channel: 'R1', io: 'output', label: 'Light zone 4' },
  light_z5: { tagId: 'LIGHT_Z5', channel: 'R1', io: 'output', label: 'Light zone 5' },
  light_z6: { tagId: 'LIGHT_Z6', channel: 'R1', io: 'output', label: 'Light zone 6' },
  pump_pilot: { tagId: 'PUMP_RUN_CMD', channel: 'R1', io: 'output', label: 'Filter pump contactor coil' },
  heater: { tagId: 'HP_RUN_CMD', channel: 'R1', io: 'output', label: 'Heater / heat-pump enable' },
  bw_valve: { tagId: 'BW_VALVE_BW', channel: 'R1', io: 'output', label: 'Backwash valve' },
  spa_jets: { tagId: 'SPA_JETS', channel: 'R1', io: 'output', label: 'Spa jets / blower' },
};

const POOL_DI_ROLES = {
  flow_sw: { tagId: 'POOL_FLOW_SW', channel: 'I1', io: 'input', label: 'Flow switch' },
};

function slugId(raw, fallback) {
  const s = String(raw || '').trim().replace(/[^A-Za-z0-9_-]/g, '_');
  return s || fallback;
}

/**
 * Parse PEAKLOGIC_POOL_WAVESHARE_RELAYS=role:deviceId[:diRole],…
 * or the single-board trio PEAKLOGIC_POOL_WAVESHARE_RELAY / _ROLE / _DEVICE_ID.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ role: string, deviceId: string, driverId: string, diRole: string|null }[]}
 */
function parseWaveshareRelayBindings(env = process.env) {
  const list = String(env.PEAKLOGIC_POOL_WAVESHARE_RELAYS || '').trim();
  if (list) {
    return list.split(',').map((part, i) => {
      const bits = part.trim().split(':').map((s) => s.trim()).filter(Boolean);
      const role = (bits[0] || 'dose_acid').toLowerCase();
      const deviceId = slugId(bits[1], `ws_relay_0${i + 1}`);
      const diRole = bits[2] ? bits[2].toLowerCase() : null;
      if (!POOL_RELAY_ROLES[role]) {
        throw new Error(`Unknown Waveshare pool relay role "${role}"`);
      }
      if (diRole && diRole !== 'none' && !POOL_DI_ROLES[diRole]) {
        throw new Error(`Unknown Waveshare pool DI role "${diRole}"`);
      }
      return {
        role,
        deviceId,
        driverId: deviceId,
        diRole: diRole && diRole !== 'none' ? diRole : null,
      };
    }).filter((b) => b.role);
  }

  const on = /^(1|true|yes|on)$/i.test(String(env.PEAKLOGIC_POOL_WAVESHARE_RELAY || ''));
  if (!on) return [];
  const role = String(env.PEAKLOGIC_POOL_WAVESHARE_ROLE || 'dose_acid').trim().toLowerCase();
  if (!POOL_RELAY_ROLES[role]) {
    throw new Error(`Unknown Waveshare pool relay role "${role}"`);
  }
  const deviceId = slugId(env.PEAKLOGIC_POOL_WAVESHARE_DEVICE_ID, 'ws_relay_01');
  const diRaw = String(env.PEAKLOGIC_POOL_WAVESHARE_DI || '').trim().toLowerCase();
  const diRole = diRaw && diRaw !== 'none' ? diRaw : null;
  if (diRole && !POOL_DI_ROLES[diRole]) {
    throw new Error(`Unknown Waveshare pool DI role "${diRole}"`);
  }
  return [{ role, deviceId, driverId: deviceId, diRole }];
}

function buildWaveshareRelayDriver(binding) {
  const spec = POOL_RELAY_ROLES[binding.role];
  return {
    id: binding.driverId,
    type: 'mqtt_parc',
    enabled: true,
    deviceId: binding.deviceId,
    remoteExecution: false,
    scanMs: 100,
    reportIntervalMs: 2000,
    platform: 'waveshare-esp32s3-relay-1ch',
    comment: `Waveshare ESP32-S3-Relay-1CH-U — ${spec.label}`,
  };
}

function bindPoolTag(byId, tagId, driverId, channel, comment) {
  const existing = byId.get(tagId);
  const next = existing
    ? { ...existing }
    : {
      id: tagId,
      type: 'BOOL',
      role: channel === 'I1' ? 'input' : 'output',
      value: false,
    };
  next.driverId = driverId;
  next.driverAddress = { ...(next.driverAddress || {}), channel };
  if (comment) next.comment = comment;
  byId.set(tagId, next);
}

/**
 * Retarget pool ST tags onto Waveshare satellite drivers.
 * @param {Map<string, object>} byId
 * @param {{ role: string, deviceId: string, driverId: string, diRole: string|null }[]} bindings
 */
function bindWavesharePoolRelays(byId, bindings) {
  for (const b of bindings || []) {
    const spec = POOL_RELAY_ROLES[b.role];
    if (!spec) continue;
    bindPoolTag(byId, spec.tagId, b.driverId, spec.channel, `Waveshare ${b.deviceId} — ${spec.label}`);
    if (b.diRole && POOL_DI_ROLES[b.diRole]) {
      const di = POOL_DI_ROLES[b.diRole];
      bindPoolTag(byId, di.tagId, b.driverId, di.channel, `Waveshare ${b.deviceId} — ${di.label}`);
    }
  }
}

module.exports = {
  POOL_RELAY_ROLES,
  POOL_DI_ROLES,
  parseWaveshareRelayBindings,
  buildWaveshareRelayDriver,
  bindWavesharePoolRelays,
};

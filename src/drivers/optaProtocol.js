'use strict';

const { version: APP_VERSION } = require('../../package.json');
const {
  getTimezoneOffsetMinutes,
  resolveTimezone,
} = require('../settings/timezoneSettings');

/** Must match MV_PROTOCOL_VERSION in firmware/.../mv_version.h */
const OPTA_PROTOCOL_VERSION = 2;

/** Max bytecode deploy payload (wire JSON); firmware MV_BC_MAX */
const OPTA_PROGRAM_MAX_BYTES = 32768;

function workspaceTimezone(explicit) {
  if (explicit) return explicit;
  try {
    const persistence = require('../persistence');
    return resolveTimezone(persistence);
  } catch {
    return resolveTimezone(null);
  }
}

function parseSemver(v) {
  const m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverCompare(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function clientHeaders(opts = {}) {
  const nowMs = Date.now();
  const tz = workspaceTimezone(opts.timeZone);
  return {
    'X-MV-Client-Version': APP_VERSION,
    'X-MV-Protocol-Version': String(OPTA_PROTOCOL_VERSION),
    'X-MV-Client-Time': String(Math.floor(nowMs / 1000)),
    'X-MV-Client-Tz-Offset': String(getTimezoneOffsetMinutes(tz, nowMs)),
  };
}

function clientDeployMeta(opts = {}) {
  const nowMs = Date.now();
  const tz = workspaceTimezone(opts.timeZone);
  const meta = {
    clientVersion: APP_VERSION,
    protocolVersion: OPTA_PROTOCOL_VERSION,
    clientTimeUnix: Math.floor(nowMs / 1000),
    clientTzOffsetMin: getTimezoneOffsetMinutes(tz, nowMs),
  };
  if (opts.programName) meta.programName = String(opts.programName);
  if (opts.autoRunOnBoot === true) meta.autoRunOnBoot = true;
  return meta;
}

/** Modbus CRC16 over bytecode — matches Opta mv_program_store NV CRC. */
function crc16Modbus(buf) {
  let crc = 0xFFFF;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let b = 0; b < 8; b += 1) {
      crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
    }
  }
  return crc & 0xFFFF;
}

function bcDeployCrc(bcBase64) {
  return crc16Modbus(Buffer.from(String(bcBase64 || ''), 'base64'));
}

/**
 * MQTT sync_time body — separate from put_program deploy meta.
 * Uses workspace timezone (default America/New_York), not the host OS zone
 * (cloud Linux hosts are often UTC / GMT).
 * @param {number} [nowMs]
 * @param {string} [timeZone] IANA zone override
 */
function buildSyncTimeBody(nowMs = Date.now(), timeZone) {
  const tz = workspaceTimezone(timeZone);
  return {
    unixUtc: Math.floor(nowMs / 1000),
    tzOffsetMin: getTimezoneOffsetMinutes(tz, nowMs),
  };
}

function checkOptaDeviceStatus(status) {
  const warnings = [];
  const errors = [];
  if (!status || typeof status !== 'object') {
    errors.push('Opta did not return status JSON');
    return { ok: false, warnings, errors, device: status || null };
  }
  if (status.protocolVersion == null) {
    warnings.push(
      'Opta firmware has no protocolVersion — re-flash from est-pc/firmware/arduino-opta-st',
    );
  } else if (Number(status.protocolVersion) !== OPTA_PROTOCOL_VERSION) {
    errors.push(
      `Protocol mismatch: Opta=${status.protocolVersion} PeakLogic=${OPTA_PROTOCOL_VERSION} — re-flash Opta ST firmware`,
    );
  }
  if (!status.firmwareVersion) {
    warnings.push('Opta firmwareVersion missing — re-flash PeakLogic Opta ST firmware');
  } else if (semverCompare(status.firmwareVersion, APP_VERSION) < 0) {
    warnings.push(
      `Opta firmware ${status.firmwareVersion} is older than PeakLogic ${APP_VERSION}`,
    );
  }
  return {
    ok: errors.length === 0,
    warnings,
    errors,
    device: status,
  };
}

module.exports = {
  APP_VERSION,
  OPTA_PROTOCOL_VERSION,
  OPTA_PROGRAM_MAX_BYTES,
  parseSemver,
  semverCompare,
  clientHeaders,
  clientDeployMeta,
  buildSyncTimeBody,
  crc16Modbus,
  bcDeployCrc,
  checkOptaDeviceStatus,
};

'use strict';

const { bcDeployCrcFromBase64 } = require('../engine/bcDeployCrc');
const { buildOptaProgramBody } = require('./mqttOptaProgram');
const { recordProgramDeployVersion } = require('./programDeployVersion');

function normalizeCrc(v) {
  const n = Math.trunc(Number(v) || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n & 0xffff;
}

function normalizeProgramName(name) {
  return String(name || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function basenameProgramName(name) {
  const n = normalizeProgramName(name);
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Extract program NV / runtime fields from Parc registry device record. */
function deviceProgramStateFromRegistry(device) {
  const rt = device?.runtime && typeof device.runtime === 'object' ? device.runtime : {};
  return {
    programNvCrc: normalizeCrc(rt.programNvCrc),
    programName: rt.programName || '',
    programLoaded: rt.programOk !== false,
    programOk: rt.programOk !== false,
    programFromNv: rt.programFromNv === true,
    autoRunOnBoot: rt.autoRunOnBoot === true,
    runtimeRunning: rt.running === true,
    source: 'telemetry',
  };
}

/** Merge get_program cmd body over telemetry snapshot. */
function deviceProgramStateFromGetProgram(body) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    programNvCrc: normalizeCrc(b.programNvCrc),
    programName: b.programName || '',
    programLoaded: b.programLoaded !== false,
    programOk: b.programLoaded !== false,
    programFromNv: b.programFromNv === true,
    autoRunOnBoot: b.autoRunOnBoot === true,
    runtimeRunning: undefined,
    source: 'get_program',
  };
}

function mergeDeviceProgramState(registryDevice, getProgramBody) {
  const fromTelemetry = deviceProgramStateFromRegistry(registryDevice);
  const fromCmd = getProgramBody ? deviceProgramStateFromGetProgram(getProgramBody) : null;
  if (!fromCmd) return fromTelemetry;
  return {
    ...fromTelemetry,
    ...fromCmd,
    runtimeRunning: fromTelemetry.runtimeRunning,
    source: 'get_program+telemetry',
  };
}

/**
 * Build PC-side deploy artifact (bytecode + Modbus CRC) for remote ST devices.
 * @returns {{ ok: true, crc: number, bcBytes: number, tagCount: number, body: object, built: object }
 *   | { ok: false, errors: string[] }}
 */
function buildPcProgramDeployArtifact(source, tagStore, driverId) {
  const built = buildOptaProgramBody(source, tagStore, driverId);
  if (!built.ok) return built;
  const bcBuf = Buffer.from(built.body.bc, 'base64');
  const crc = bcDeployCrcFromBase64(built.body.bc);
  return {
    ok: true,
    crc,
    bcBytes: bcBuf.length,
    tagCount: built.body.tagCount,
    body: built.body,
    built,
  };
}

/**
 * Decide whether put_program can be skipped (NV flash already holds matching bytecode).
 * @returns {{ action: 'deploy'|'skip'|'skip_deploy', reason: string, needsRuntimeStart: boolean }}
 */
function evaluateProgramDeploy({ pc, device, requireProgramLoaded = true }) {
  const pcCrc = normalizeCrc(pc?.crc);
  const devCrc = normalizeCrc(device?.programNvCrc);

  if (!pcCrc) {
    return {
      action: 'deploy',
      reason: 'PC bytecode CRC unavailable',
      needsRuntimeStart: true,
    };
  }
  if (!devCrc) {
    return {
      action: 'deploy',
      reason: 'device has no program NV CRC (empty flash or legacy firmware)',
      needsRuntimeStart: true,
    };
  }
  if (devCrc !== pcCrc) {
    return {
      action: 'deploy',
      reason: `program CRC mismatch (device 0x${devCrc.toString(16)} vs PC 0x${pcCrc.toString(16)})`,
      needsRuntimeStart: true,
    };
  }

  if (requireProgramLoaded && device?.programLoaded === false) {
    return {
      action: 'deploy',
      reason: 'device reports program not loaded',
      needsRuntimeStart: true,
    };
  }

  const pcName = basenameProgramName(pc?.programName);
  const devName = basenameProgramName(device?.programName);
  if (pcName && devName && pcName !== devName) {
    return {
      action: 'deploy',
      reason: `program name mismatch (${devName} on device vs ${pcName} on PC)`,
      needsRuntimeStart: true,
    };
  }

  if (device?.runtimeRunning === true) {
    return {
      action: 'skip',
      reason: `NV CRC 0x${devCrc.toString(16)} matches — ST already running`,
      needsRuntimeStart: false,
    };
  }

  return {
    action: 'skip_deploy',
    reason: `NV CRC 0x${devCrc.toString(16)} matches — skip download, start runtime only`,
    needsRuntimeStart: true,
  };
}

async function fetchDeviceProgramState(hub, deviceId, registryDevice) {
  if (!hub || typeof hub.sendCommand !== 'function') {
    return deviceProgramStateFromRegistry(registryDevice);
  }
  try {
    const body = await hub.sendCommand(deviceId, 'get_program', {}, { timeoutMs: 12000 });
    return mergeDeviceProgramState(registryDevice, body);
  } catch {
    return deviceProgramStateFromRegistry(registryDevice);
  }
}

function skipDeployEnabled(settings) {
  const s = settings?.mqttParc;
  if (s && s.skipDeployWhenCrcMatches === false) return false;
  return true;
}

function recordDeployVerdict(deviceId, pc, device, verdict, extra = {}) {
  return recordProgramDeployVersion(deviceId, {
    programName: pc?.programName || '',
    bcCrc: normalizeCrc(pc?.crc),
    bcBytes: pc?.bcBytes ?? null,
    tagCount: pc?.tagCount ?? null,
    deviceCrc: normalizeCrc(device?.programNvCrc),
    deviceProgramName: device?.programName || '',
    programFromNv: device?.programFromNv === true,
    autoRunOnBoot: device?.autoRunOnBoot === true,
    runtimeRunning: device?.runtimeRunning === true,
    action: verdict.action,
    reason: verdict.reason,
    skipped: verdict.action === 'skip' || verdict.action === 'skip_deploy',
    deployed: extra.deployed === true,
    probeSource: device?.source || '',
  });
}

module.exports = {
  normalizeCrc,
  normalizeProgramName,
  deviceProgramStateFromRegistry,
  deviceProgramStateFromGetProgram,
  mergeDeviceProgramState,
  buildPcProgramDeployArtifact,
  evaluateProgramDeploy,
  fetchDeviceProgramState,
  skipDeployEnabled,
  recordDeployVerdict,
};

'use strict';

/**
 * Cloud station deploy — push the station's assigned ST program to its bound Opta
 * directly over MQTT (put_program), set the auto-run-on-boot flag explicitly, and
 * start the runtime.
 *
 * Firmware behavior this relies on (see est-pc firmware mv_st.cpp / mv_program_store.cpp):
 *   - put_program always persists the compiled bytecode to QSPI NV flash, so the
 *     program survives a power failure.
 *   - autoRunOnBoot (explicit bool) sets/clears the NV auto-run flag; on boot the
 *     Opta reloads the NV program and, if the flag is set, starts the runtime.
 *   - runtime_start begins scanning immediately after deploy.
 */

const { getDb } = require('../db/mongo');
const programStore = require('../programs/programStore');
const { buildOptaProgramBody, slimPutProgramBodyForMqtt } = require('../parc/mqttOptaProgram');
const { clientDeployMeta, OPTA_PROGRAM_MAX_BYTES } = require('../drivers/optaProtocol');
const { getStationType } = require('../fleet/stationTypes');
const mqttIngest = require('../ingest/mqttCloudIngest');

/** Minimal tag store — program refs resolve to inferred defaults during deploy. */
const EMPTY_TAG_STORE = { list: () => [] };

async function loadStationForDeploy(tenantId, systemId) {
  const db = getDb();
  const system = await db.collection('systems').findOne({ _id: systemId, tenantId });
  if (!system) return { ok: false, status: 404, error: 'Station not found' };

  const devices = await db.collection('devices')
    .find({ tenantId, systemId })
    .toArray();
  const primary = devices[0] || null;
  const deviceId = primary?.driverConfig?.deviceId || null;
  if (!deviceId) {
    return { ok: false, status: 400, error: 'No edge device is bound to this station — bind a Device ID first.' };
  }

  const meta = system.metadata || {};
  const profile = getStationType(meta.stationType) || {};
  const programRel = meta.program || profile.program || null;
  if (!programRel) {
    return { ok: false, status: 400, error: 'This station has no ST program assigned.' };
  }

  return {
    ok: true,
    system,
    deviceId,
    driverId: primary.slug || primary.driverConfig?.deviceId || 'mqtt_parc',
    programRel,
    scanMs: Number(system.scanMs) > 0 ? Number(system.scanMs) : 100,
  };
}

/**
 * Deploy + (optionally) auto-run a station's program to its bound Opta.
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string} args.systemId
 * @param {boolean} [args.autoRunOnBoot=true] — persist auto-run-after-power-up flag
 * @param {boolean} [args.start=true] — send runtime_start after deploy
 */
async function deployStationProgram(args) {
  const { tenantId, systemId } = args;
  const autoRunOnBoot = args.autoRunOnBoot !== false;
  const start = args.start !== false;

  if (!mqttIngest.isConnected()) {
    return { ok: false, status: 503, error: 'Cloud MQTT is not connected to the broker.' };
  }

  const loaded = await loadStationForDeploy(tenantId, systemId);
  if (!loaded.ok) return loaded;
  const { deviceId, driverId, programRel, scanMs } = loaded;

  const source = programStore.readProgram(programRel);
  if (!source || !String(source).trim()) {
    return { ok: false, status: 400, error: `ST program not found on server: ${programRel}` };
  }

  const built = buildOptaProgramBody(source, EMPTY_TAG_STORE, driverId);
  if (!built.ok) {
    return { ok: false, status: 400, error: `Program invalid: ${(built.errors || []).join('; ')}` };
  }

  const body = {
    ...built.body,
    ...clientDeployMeta({ programName: programRel, autoRunOnBoot }),
  };
  const mqttBody = slimPutProgramBodyForMqtt(body, built.traceMap);
  const payloadBytes = Buffer.byteLength(JSON.stringify(mqttBody));
  if (payloadBytes >= OPTA_PROGRAM_MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `Program deploy is ${payloadBytes} bytes (limit ${OPTA_PROGRAM_MAX_BYTES}).`,
    };
  }

  // Preflight: a small runtime_status confirms the device is live (fail in ~8s, not 120s)
  // and reports its MQTT packet buffer. Older/mis-allocated firmware sits at the 256 B
  // PubSubClient default, which silently drops any real put_program — catch that here.
  let status;
  try {
    status = await mqttIngest.sendCommand(deviceId, 'runtime_status', {}, { timeoutMs: 8000 });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Device ${deviceId} did not respond to a status ping (${err.message}). `
        + 'Confirm the Opta is powered, on the network, and connected to the broker.',
    };
  }
  const bufBytes = Number(status?.mqttBufferBytes) || 0;
  if (bufBytes && payloadBytes >= bufBytes) {
    return {
      ok: false,
      status: 502,
      error: `Opta MQTT buffer is ${bufBytes} B but the program deploy is ${payloadBytes} B — `
        + 'the device would drop it. Reflash the Opta with PeaklogicOptaMqttSt v2.3.55+ '
        + '(allocates the MQTT packet buffer at boot so it is not stuck at 256 B), then deploy again.',
    };
  }
  if (!bufBytes) {
    console.warn(`[station-deploy] ${deviceId} did not report mqttBufferBytes — firmware may predate v2.3.53; attempting deploy`);
  }

  try {
    console.log(`[station-deploy] put_program → ${deviceId} (${payloadBytes}B, autorun=${autoRunOnBoot}, devBuf=${bufBytes || 'unknown'})`);
    await mqttIngest.sendCommand(deviceId, 'put_program', mqttBody);
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Deploy (put_program) failed: ${err.message}. `
        + 'If the device is online, its MQTT buffer is likely too small — reflash PeaklogicOptaMqttSt v2.3.55+.',
    };
  }

  let started = false;
  if (start) {
    try {
      await mqttIngest.sendCommand(deviceId, 'runtime_start', { scanMs });
      started = true;
      console.log(`[station-deploy] runtime_start → ${deviceId} scanMs=${scanMs}`);
    } catch (err) {
      return {
        ok: true,
        status: 200,
        deviceId,
        programRel,
        autoRunOnBoot,
        started: false,
        warning: `Program deployed and stored in flash, but runtime_start failed: ${err.message}`,
      };
    }
  }

  // Commission site → activate connectivity billing term.
  try {
    const billing = require('../connectivity/connectivityBillingService');
    const system = loaded.system;
    await billing.markSiteCommissioned({
      tenantId,
      systemId,
      locationId: system.locationId,
      deviceId,
      programRel,
    });
  } catch (err) {
    console.warn('[station-deploy] connectivity billing:', err.message || err);
  }

  return {
    ok: true,
    status: 200,
    deviceId,
    programRel,
    tagCount: built.body?.tagCount ?? null,
    payloadBytes,
    autoRunOnBoot,
    started,
  };
}

module.exports = { deployStationProgram, loadStationForDeploy };

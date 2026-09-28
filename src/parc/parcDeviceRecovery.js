'use strict';

const persistence = require('../persistence');
const { registry } = require('./deviceRegistry');
const { getMqttCentralHub } = require('./mqttCentralHub');
const { MqttParcOptaDriver } = require('../drivers/mqttParcOptaDriver');

const RECOVERY_DEBOUNCE_MS = 30000;
const _lastRecovery = new Map();
let _deps = {};

function registerParcRecoveryDeps(deps = {}) {
  if (deps.scanEngine) _deps.scanEngine = deps.scanEngine;
  if (deps.driverManager) _deps.driverManager = deps.driverManager;
}

function isCloudDeployment() {
  try {
    return require('../cloud/agentProtocol').isCloudDeployment();
  } catch {
    return false;
  }
}

function shouldRecoverOptaRuntime(settings, opts = {}) {
  if (opts.allowWithoutRemote) return true;
  if (settings.remoteExecution === true) return true;
  return isCloudDeployment();
}

function driverForRecovery(deviceId, driverManager) {
  const id = String(deviceId || '').trim();
  if (driverManager?.configs) {
    for (const cfg of driverManager.configs) {
      if (cfg.enabled === false) continue;
      if (cfg.type !== 'mqtt_parc' && cfg.type !== 'opta_remote') continue;
      const cfgId = String(cfg.deviceId || cfg.id || '').trim();
      if (cfgId !== id) continue;
      const inst = driverManager.instances?.get(cfg.id);
      if (inst?.startRuntime) return inst;
      return new MqttParcOptaDriver({
        ...cfg,
        id: cfg.id || 'hmi_runtime',
        type: 'mqtt_parc',
        deviceId: id,
        remoteExecution: true,
      });
    }
  }
  return new MqttParcOptaDriver({
    id: 'hmi_runtime',
    type: 'mqtt_parc',
    deviceId: id,
    remoteExecution: true,
  });
}

async function maybeRecoverParcDevice(deviceId, opts = {}) {
  const id = String(deviceId || '').trim();
  if (!id) return { skipped: true, reason: 'no deviceId' };

  const now = Date.now();
  const last = _lastRecovery.get(id) || 0;
  if (!opts.force && now - last < RECOVERY_DEBOUNCE_MS) {
    return { skipped: true, reason: 'debounced' };
  }
  _lastRecovery.set(id, now);

  const settings = opts.settings || persistence.readJson('settings.json', {});
  if (!shouldRecoverOptaRuntime(settings, opts)) {
    return { skipped: true, reason: 'remoteExecution off' };
  }

  const driverManager = opts.driverManager || _deps.driverManager;
  const drv = driverForRecovery(id, driverManager);
  if (!drv?.startRuntime) return { skipped: true, reason: 'no driver' };

  const hub = opts.hub || getMqttCentralHub(registry);
  if (!hub.isLive()) return { skipped: true, reason: 'hub not connected' };

  const reg = opts.registry || registry;
  const dev = reg.getDevice?.(id);
  if (dev?.runtime?.running === true) {
    return { skipped: true, reason: 'already running' };
  }

  const scanMs = Number(drv.cfg?.scanMs) || Number(settings.scanMs) || 100;
  const reportMs = Math.max(
    100,
    Math.min(600000, Number(drv.cfg?.reportIntervalMs) || scanMs * 2),
  );

  console.log(`[parc-recovery] deviceId ${id} reason=${opts.reason || 'unknown'}`);

  hub.publishDeviceConfig(id, {
    pauseTelemetry: false,
    debugAttached: true,
    reportMs,
  });

  try {
    await drv.startRuntime({ deviceId: id, attach: true });
  } catch (e) {
    console.warn(`[parc-recovery] runtime_start failed for ${id}: ${e.message || e}`);
    return { ok: false, error: e.message || String(e) };
  }

  return { ok: true };
}

function resetParcRecoveryState() {
  _lastRecovery.clear();
}

module.exports = {
  registerParcRecoveryDeps,
  maybeRecoverParcDevice,
  resetParcRecoveryState,
  RECOVERY_DEBOUNCE_MS,
  shouldRecoverOptaRuntime,
};

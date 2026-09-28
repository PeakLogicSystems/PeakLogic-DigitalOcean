'use strict';

const { QUALITY } = require('../tags/constants');
const { resolveParcRegistry } = require('./deviceRegistry');
const { mirrorDuplexFloatLevels } = require('./duplexFloatMirror');
const { dedupeParcTags, ensureParcHardwareTags } = require('./parcTagSync');

function applyParcRows(tagStore, rows, quality) {
  if (!tagStore || !rows?.length) return 0;
  let n = 0;
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!id || !tagStore.get(id)) continue;
    if (typeof tagStore.applyDeviceTelemetry === 'function') {
      tagStore.applyDeviceTelemetry(id, row, quality);
    } else if (typeof tagStore.setValue === 'function') {
      tagStore.setValue(id, row.value, quality);
    }
    n += 1;
  }
  return n;
}

function liveOptaDevices(reg) {
  try {
    const { listVisibleLiveOptas } = require('./parcTenantScope');
    return listVisibleLiveOptas(reg);
  } catch { /* tests without tenant module */ }
  return (reg?.listDevices?.() || []).filter(
    (d) => d && !d.stale && String(d.platform || '').includes('arduino-opta'),
  );
}

function deviceIdsFromDrivers(driverManager) {
  const ids = new Set();
  for (const cfg of driverManager?.configs || []) {
    if (cfg?.enabled === false) continue;
    if (cfg?.type !== 'mqtt_parc' && cfg?.type !== 'opta_remote') continue;
    const id = String(cfg.deviceId || cfg.id || '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

function deviceIdsFromTenant() {
  const ids = new Set();
  try {
    const { getProjectTenantId } = require('../project/projectTenantContext');
    const { tenantStore } = require('../tenants/tenantStore');
    const tid = getProjectTenantId();
    if (!tid || !tenantStore?.listDevices) return ids;
    for (const rec of tenantStore.listDevices(tid) || []) {
      const id = String(rec?.deviceId || '').trim();
      if (id) ids.add(id);
    }
  } catch {
    /* tests / appliance */
  }
  return ids;
}

function pickParcDevices(tagStore, driverManager) {
  const reg = resolveParcRegistry();
  if (!reg?.getDevice) return [];
  const wanted = new Set([...deviceIdsFromDrivers(driverManager), ...deviceIdsFromTenant()]);
  const picked = [];
  for (const id of wanted) {
    const dev = reg.getDevice(id);
    if (!dev) continue;
    try {
      const { tenantCanSeeDevice } = require('./parcTenantScope');
      if (!tenantCanSeeDevice(reg, id)) continue;
    } catch { /* appliance / tests */ }
    picked.push(dev);
  }
  if (picked.length) return picked;
  try {
    const { resolveHmiMemoryDeviceId } = require('../api/pushRemoteHmiMemory');
    const id = resolveHmiMemoryDeviceId(driverManager);
    const dev = id ? reg.getDevice(id) : null;
    if (dev) return [dev];
  } catch { /* optional */ }
  const live = liveOptaDevices(reg);
  if (live.length === 1 && tagStore?.get?.('MOTOR1_HOA')) return live;
  return [];
}

function driverIdForDevice(driverManager, deviceId) {
  for (const cfg of driverManager?.configs || []) {
    if (cfg?.enabled === false) continue;
    if (cfg?.type !== 'mqtt_parc' && cfg?.type !== 'opta_remote') continue;
    if (String(cfg.deviceId || cfg.id || '').trim() === String(deviceId || '')) {
      return cfg.id || deviceId;
    }
  }
  return deviceId || 'mqtt_parc';
}

function syncFromFleetRegistry(tagStore, driverManager) {
  let n = 0;
  for (const dev of pickParcDevices(tagStore, driverManager)) {
    const quality = dev.stale ? QUALITY.STALE : QUALITY.GOOD;
    const rows = dedupeParcTags(dev.tags || []);
    try {
      ensureParcHardwareTags(tagStore, rows, driverIdForDevice(driverManager, dev.deviceId));
    } catch { /* capacity / persist */ }
    n += applyParcRows(tagStore, rows, quality);
  }
  return n;
}

/**
 * Copy live mqtt_parc telemetry into the Studio tag store.
 * Cloud SaaS often has no scan engine and tenant workspaces may lack an mqtt_parc
 * driver (or tags with driverId) after 8/13 isolation — still pull fleet telemetry
 * by tag id so DUPLEXLS / 3D stay live.
 */
function optaRuntimeSnapshot(driverManager) {
  const { resolveHmiMemoryDeviceId } = require('../api/pushRemoteHmiMemory');
  const deviceId = resolveHmiMemoryDeviceId(driverManager);
  if (!deviceId) return null;
  const reg = resolveParcRegistry();
  const dev = reg.getDevice?.(deviceId);
  if (!dev) return { deviceId, running: false, programOk: false };
  return {
    deviceId,
    running: dev.runtime?.running === true,
    programOk: dev.runtime?.programOk !== false,
    programFromNv: !!dev.runtime?.programFromNv,
    cycles: Number(dev.runtime?.cycles) || 0,
  };
}

function kickStoppedOptaRuntime(driverManager) {
  const snap = optaRuntimeSnapshot(driverManager);
  if (!snap?.deviceId || snap.running) return;
  try {
    const { maybeRecoverParcDevice } = require('./parcDeviceRecovery');
    maybeRecoverParcDevice(snap.deviceId, {
      reason: 'live-io-st-stopped',
      allowWithoutRemote: true,
      driverManager,
    }).catch((e) => {
      console.warn(`[parc-recovery] ${snap.deviceId}:`, e.message || e);
    });
  } catch { /* optional */ }
}

function syncMqttParcLiveIo(tagStore, driverManager) {
  if (!tagStore) return { synced: 0 };
  const instances = driverManager?.instances;
  let synced = 0;
  if (instances && typeof instances.forEach === 'function') {
    instances.forEach((inst) => {
      if (!inst || inst.cfg?.type !== 'mqtt_parc') return;
      if (typeof inst.runScanCycle !== 'function') return;
      try {
        inst.runScanCycle(tagStore);
        synced += 1;
      } catch {
        /* keep serving last snapshot */
      }
    });
  }
  synced += syncFromFleetRegistry(tagStore, driverManager);
  try {
    mirrorDuplexFloatLevels(tagStore);
  } catch {
    /* optional */
  }
  kickStoppedOptaRuntime(driverManager);
  return { synced };
}

module.exports = {
  syncMqttParcLiveIo,
  syncFromFleetRegistry,
  pickParcDevices,
  optaRuntimeSnapshot,
};

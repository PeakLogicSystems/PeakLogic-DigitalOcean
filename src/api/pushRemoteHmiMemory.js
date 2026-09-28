'use strict';

const persistence = require('../persistence');
const { MqttParcOptaDriver } = require('../drivers/mqttParcOptaDriver');
const { resolveParcRegistry } = require('../parc/deviceRegistry');
const { resolveForceDriverConfig, resolveForceDeviceId } = require('./pushRemoteTagForce');

function listLiveOptaDevices() {
  const reg = resolveParcRegistry();
  try {
    const { listVisibleLiveOptas } = require('../parc/parcTenantScope');
    return listVisibleLiveOptas(reg);
  } catch { /* tests without tenant module */ }
  return (reg.listDevices() || []).filter(
    (d) => d && !d.stale && String(d.platform || '').includes('arduino-opta'),
  );
}

function remoteExecutionOn(scanEngine) {
  const settings = persistence.readJson('settings.json', {});
  return settings.remoteExecution === true || scanEngine?.remoteExecution === true;
}

function isCloudHmiWrite() {
  try {
    return require('../cloud/agentProtocol').isCloudDeployment();
  } catch {
    return false;
  }
}

function shouldPushRemoteHmiMemory(scanEngine) {
  return remoteExecutionOn(scanEngine) || isCloudHmiWrite();
}

function tenantAssignedDeviceIds() {
  try {
    const { getProjectTenantId } = require('../project/projectTenantContext');
    const { tenantStore } = require('../tenants/tenantStore');
    const tid = getProjectTenantId();
    if (!tid || !tenantStore?.listDevices) return [];
    return (tenantStore.listDevices(tid) || [])
      .map((d) => String(d?.deviceId || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function resolveHmiMemoryDeviceId(driverManager) {
  const live = listLiveOptaDevices();
  const liveIds = new Set(live.map((d) => d.deviceId));

  for (const cfg of driverManager?.configs || []) {
    if (cfg?.enabled === false) continue;
    if (cfg?.type !== 'mqtt_parc' && cfg?.type !== 'opta_remote') continue;
    const id = String(cfg.deviceId || cfg.id || '').trim();
    if (id && liveIds.has(id)) return id;
  }

  const assigned = tenantAssignedDeviceIds().filter((id) => liveIds.has(id));
  if (assigned.length === 1) return assigned[0];

  if (live.length === 1) return live[0].deviceId;

  const reg = resolveParcRegistry();
  const mv = live.find((d) => String(d.deviceId).startsWith('mv_') && reg.getDevice(d.deviceId));
  return mv?.deviceId || '';
}

function driverForDevice(driverManager, deviceId) {
  const cfg = (driverManager?.configs || []).find((c) => {
    if (c?.enabled === false) return false;
    if (c?.type !== 'mqtt_parc' && c?.type !== 'opta_remote') return false;
    return String(c.deviceId || c.id || '').trim() === deviceId;
  });
  const inst = cfg && driverManager?.instances?.get(cfg.id);
  if (inst && (inst.writeMemoryMany || inst.writeMemory)) {
    return inst;
  }
  return new MqttParcOptaDriver({
    id: cfg?.id || 'hmi_memory',
    type: 'mqtt_parc',
    deviceId,
    remoteExecution: true,
  });
}

function resolveWriteDevice(driverManager, tag) {
  let deviceId = '';
  let drv = null;
  if (tag?.driverId) {
    try {
      const resolved = resolveForceDriverConfig(driverManager, tag);
      deviceId = resolveForceDeviceId(resolved.cfg, driverManager);
      drv = driverManager?.instances?.get(resolved.driverId);
    } catch {
      deviceId = '';
      drv = null;
    }
  }
  if (!deviceId) deviceId = resolveHmiMemoryDeviceId(driverManager);
  return { deviceId, drv };
}

function driverForWrite(driverManager, deviceId, drv) {
  if (drv?.writeMemoryMany || drv?.writeMemory) return drv;
  return driverForDevice(driverManager, deviceId);
}

async function sendRemoteMemoryTags(drv, tags, deviceId) {
  if (typeof drv.writeMemoryMany === 'function') {
    return drv.writeMemoryMany(tags, { deviceId });
  }
  for (const tag of tags) {
    await drv.writeMemory(tag, { deviceId });
  }
  return { ok: true, deviceId };
}

/**
 * Send HMI memory writes to the live Opta in one write_memory command.
 * Cloud HMI always attempts the Opta write even if settings.remoteExecution is off.
 */
async function pushRemoteHmiMemoryMany(driverManager, scanEngine, tags) {
  const memoryTags = (Array.isArray(tags) ? tags : []).filter(
    (t) => t?.id && t.role === 'memory',
  );
  if (!memoryTags.length) return { skipped: true, reason: 'not memory' };
  if (!shouldPushRemoteHmiMemory(scanEngine)) {
    return { skipped: true, reason: 'local execution' };
  }

  const first = memoryTags[0];
  const resolved = resolveWriteDevice(driverManager, first);
  let deviceId = resolved.deviceId;
  let drv = resolved.drv;
  if (!deviceId) deviceId = resolveHmiMemoryDeviceId(driverManager);
  if (!deviceId) {
    throw Object.assign(new Error('No live Opta for HMI write'), {
      status: 502,
      code: 'NO_LIVE_OPTA',
    });
  }
  drv = driverForWrite(driverManager, deviceId, drv);
  await sendRemoteMemoryTags(drv, memoryTags, deviceId);
  return { ok: true, deviceId, written: memoryTags.length };
}

async function pushRemoteHmiMemory(driverManager, scanEngine, tag) {
  return pushRemoteHmiMemoryMany(driverManager, scanEngine, tag ? [tag] : []);
}

module.exports = {
  pushRemoteHmiMemory,
  pushRemoteHmiMemoryMany,
  resolveHmiMemoryDeviceId,
  shouldPushRemoteHmiMemory,
};

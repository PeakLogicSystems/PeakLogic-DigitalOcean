'use strict';

const {
  reconcileMqttParcDriversFromRegistry,
  isParcRegistryNoiseId,
} = require('../devices/bulkAddParcOpta');
const { parcDeviceHasDriver } = require('./parcDiscovery');
const { isMvDeviceId, normalizeAteccSerialHex } = require('./optaSerial');
const { mergeParcTagsIntoStore } = require('./parcTagSync');
const { patchWorkspaceDrivers } = require('../project/estFile');
const { MAX_TAGS } = require('../config');

/** Template placeholder device ids — replace with a live Parc registry device when available. */
function isParcPlaceholderDeviceId(deviceId, driverId) {
  const id = String(deviceId || '').trim();
  if (!id) return true;
  if (id === String(driverId || '').trim()) return true;
  if (/^lift_dd_\d+$/i.test(id)) return true;
  if (/^opta_st_\d+$/i.test(id)) return true;
  return false;
}

/** Field registry devices not yet bound to an mqtt_parc / opta_remote driver (dedupe by serial). */
function listUnlinkedFieldRegistryDevices(registry, drivers) {
  const linked = new Set(
    (drivers || [])
      .filter((d) => d.type === 'mqtt_parc' || d.type === 'opta_remote')
      .map((d) => String(d.deviceId || '').trim())
      .filter(Boolean),
  );
  const byKey = new Map();
  for (const dev of registry.listDevices()) {
    const deviceId = dev.deviceId;
    if (!deviceId || isParcRegistryNoiseId(deviceId) || linked.has(deviceId)) continue;
    const sn = normalizeAteccSerialHex(dev.ateccSerial || dev.meta?.ateccSerial || '');
    const key = sn || deviceId;
    const prev = byKey.get(key);
    if (!prev || (isMvDeviceId(deviceId) && !isMvDeviceId(prev.deviceId))) {
      byKey.set(key, dev);
    }
  }
  return [...byKey.values()];
}

/** When a template driver still has a placeholder deviceId, bind the sole unlinked registry Opta. */
function bindTemplateDriverToRegistry(driver, registry, drivers) {
  if (!driver || driver.type !== 'mqtt_parc') return driver;
  if (!isParcPlaceholderDeviceId(driver.deviceId, driver.id)) return driver;
  const unlinked = listUnlinkedFieldRegistryDevices(registry, drivers);
  if (unlinked.length !== 1) return driver;
  const dev = unlinked[0];
  const sn = dev.ateccSerial || dev.meta?.ateccSerial || '';
  return {
    ...driver,
    deviceId: dev.deviceId,
    ...(sn ? { ateccSerial: sn } : {}),
  };
}

async function syncParcTagsForDrivers(tagStore, driverManager, registry, positionIds) {
  if (!tagStore || !positionIds?.length) return { synced: 0 };
  let tagList = tagStore.list();
  let synced = 0;
  for (const positionId of positionIds) {
    const dev = registry.getDevice(
      (driverManager.list().find((d) => d.id === positionId) || {}).deviceId,
    );
    if (!dev || dev.stale) continue;
    const merged = mergeParcTagsIntoStore(tagList, dev.tags, positionId, { reassign: true });
    if (!merged.ok || merged.tags.length > MAX_TAGS) continue;
    tagList = merged.tags;
    synced += 1;
  }
  if (synced > 0) {
    tagStore.replaceAll(tagList);
    await driverManager.rebuild({ connectDeferred: true });
  }
  return { synced };
}

/**
 * Ensure every field Parc registry device has an mqtt_parc driver row.
 * Safe to call repeatedly — only adds missing links.
 */
async function ensureParcDriversFromRegistry(options = {}) {
  const {
    driverManager,
    registry,
    tagStore,
    syncTags = false,
    patchWorkspace = true,
  } = options;
  if (!driverManager?.list || !registry?.listDevices) {
    return { changed: false, added: [], drivers: [] };
  }

  const before = driverManager.list();
  const recon = reconcileMqttParcDriversFromRegistry(before, registry);
  if (!recon.changed) {
    return { changed: false, added: [], drivers: before };
  }

  driverManager.save(recon.drivers);
  if (patchWorkspace) patchWorkspaceDrivers(recon.drivers);
  await driverManager.rebuild({ connectDeferred: true });

  if (syncTags) {
    await syncParcTagsForDrivers(tagStore, driverManager, registry, recon.added);
  }

  console.log(`[mqtt-parc] linked registry device(s) to drivers: ${recon.added.join(', ')}`);
  return { changed: true, added: recon.added, drivers: recon.drivers };
}

/** Link a single registry device when telemetry arrives and no driver exists yet. */
async function ensureParcDriverForDevice(deviceId, options = {}) {
  const id = String(deviceId || '').trim();
  if (!id || isParcRegistryNoiseId(id)) return { changed: false, added: [] };
  const { driverManager } = options;
  if (!driverManager || parcDeviceHasDriver(driverManager.list(), id)) {
    return { changed: false, added: [] };
  }
  return ensureParcDriversFromRegistry(options);
}

module.exports = {
  isParcPlaceholderDeviceId,
  listUnlinkedFieldRegistryDevices,
  bindTemplateDriverToRegistry,
  ensureParcDriversFromRegistry,
  ensureParcDriverForDevice,
  syncParcTagsForDrivers,
};

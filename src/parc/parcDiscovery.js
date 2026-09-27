'use strict';

const { isParcRegistryNoiseId, buildParcOptaDriver } = require('../devices/bulkAddParcOpta');
const { patchWorkspaceDrivers } = require('../project/estFile');
const {
  isAteccDeviceId,
  extractAteccSerialFromReport,
  deviceIdFromAteccSerial,
  legacyOptaDeviceIdFromAteccSerial,
} = require('./optaSerial');

const OPTA_ST_PLATFORM = 'arduino-opta-mqtt-st';

function reportPlatform(body) {
  if (!body || typeof body !== 'object') return '';
  return String(body.platform || body.meta?.platform || '').trim();
}

function isEligibleOptaDiscoveryReport(body) {
  const deviceId = String(body?.deviceId || '').trim();
  if (isParcRegistryNoiseId(deviceId)) return false;
  if (!isAteccDeviceId(deviceId)) return false;
  const serial = extractAteccSerialFromReport(body);
  if (!serial) return false;
  let expectedMv;
  let expectedLegacy;
  try {
    expectedMv = deviceIdFromAteccSerial(serial);
    expectedLegacy = legacyOptaDeviceIdFromAteccSerial(serial);
  } catch {
    return false;
  }
  if (deviceId !== expectedMv && deviceId !== expectedLegacy) return false;
  return reportPlatform(body) === OPTA_ST_PLATFORM;
}

function parcDeviceHasDriver(drivers, deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return false;
  return (drivers || []).some((d) => {
    if (d.type !== 'mqtt_parc' && d.type !== 'opta_remote') return false;
    return d.id === id || String(d.deviceId || '').trim() === id;
  });
}

function expansionCountFromReport(report, registryDev) {
  const mods = report?.expansionModules
    || report?.meta?.expansionModules
    || registryDev?.expansionModules
    || [];
  if (Array.isArray(mods) && mods.length) return mods.length;
  const n = report?.expansionCount ?? report?.meta?.expansionCount
    ?? registryDev?.expansionCount;
  return Number.isFinite(n) ? n : 0;
}

function positionIdForDevice(drivers, deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return null;
  const drv = (drivers || []).find(
    (d) => (d.type === 'mqtt_parc' || d.type === 'opta_remote')
      && String(d.deviceId || '').trim() === id,
  );
  return drv?.id || null;
}

function enrichParcDevicesWithDriverLink(devices, drivers) {
  return (devices || []).map((d) => ({
    ...d,
    hasDriver: parcDeviceHasDriver(drivers, d.deviceId),
    positionId: positionIdForDevice(drivers, d.deviceId),
  }));
}

async function maybeAutoDiscoverDriver({
  report,
  registry,
  driverManager,
  settings,
  getSettings,
  tagStore,
}) {
  void tagStore;
  const deviceId = String(report?.deviceId || '').trim();
  const resolvedSettings = typeof getSettings === 'function' ? getSettings() : settings;
  if (resolvedSettings?.mqttParc?.autoDiscoverDrivers !== true) {
    return { discovered: false, deviceId, skipped: true, reason: 'autoDiscoverDrivers disabled' };
  }
  if (parcDeviceHasDriver(driverManager.list(), deviceId)) {
    return { discovered: false, deviceId, skipped: true, reason: 'driver exists' };
  }
  if (!isEligibleOptaDiscoveryReport(report)) {
    return { discovered: false, deviceId, skipped: true, reason: 'not eligible' };
  }

  const registryDev = registry.getDevice(deviceId);
  const { suggestPositionId } = require('./positionId');
  const positionId = suggestPositionId(registryDev, deviceId)
    || `io_${String(deviceId).replace(/^opta_/, '').slice(-6).toLowerCase()}`;
  const drv = buildParcOptaDriver(deviceId, { positionId }, registryDev);
  const drivers = [...driverManager.list(), drv];
  driverManager.save(drivers);
  patchWorkspaceDrivers(drivers);

  const { bootstrapMqttParc } = require('./mqttParcBootstrap');
  await bootstrapMqttParc({ settings: resolvedSettings, drivers, persist: false });
  await driverManager.rebuild({ connectDeferred: true });

  const { getMqttCentralHub } = require('./mqttCentralHub');
  if (getMqttCentralHub(registry).isLive()) {
    await driverManager.linkMqttParcDriversIfHubLive();
  }

  const expansions = expansionCountFromReport(report, registryDev);
  const expNote = expansions ? ` (${expansions} expansion${expansions === 1 ? '' : 's'})` : '';
  console.log(`[mqtt-parc] auto-discovered driver: ${positionId} → ${deviceId}${expNote}`);

  return { discovered: true, deviceId, positionId, skipped: false, reason: null };
}

module.exports = {
  isEligibleOptaDiscoveryReport,
  maybeAutoDiscoverDriver,
  parcDeviceHasDriver,
  enrichParcDevicesWithDriverLink,
};

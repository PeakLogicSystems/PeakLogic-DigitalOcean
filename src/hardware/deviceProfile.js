'use strict';

const PLATFORM_CATALOG = {
  'arduino-opta-mqtt-st': { vendor: 'Arduino', model: 'Opta' },
  'arduino-opta': { vendor: 'Arduino', model: 'Opta' },
};

function profileFromRegistryDev(registryDev, driver, overrides = {}) {
  const platform = String(
    registryDev?.platform || registryDev?.meta?.platform || overrides.platform || '',
  ).trim();
  const catalog = PLATFORM_CATALOG[platform] || {};
  const serial = String(
    overrides.serialNumber
    || registryDev?.ateccSerial
    || registryDev?.meta?.ateccSerial
    || driver?.ateccSerial
    || '',
  ).trim();
  return {
    deviceId: String(overrides.deviceId || driver?.deviceId || registryDev?.deviceId || '').trim(),
    serialNumber: serial,
    vendor: String(overrides.vendor || registryDev?.meta?.vendor || catalog.vendor || '').trim(),
    model: String(overrides.model || registryDev?.meta?.model || catalog.model || platform || '').trim(),
    platform,
    driverType: String(overrides.driverType || driver?.type || 'mqtt_parc').trim(),
    meta: {
      ethIp: registryDev?.meta?.ethIp || null,
      firmwareVersion: registryDev?.meta?.firmwareVersion || null,
      expansionModules: registryDev?.expansionModules || registryDev?.meta?.expansionModules || [],
    },
  };
}

const SWAP_TYPES = new Set([
  'commission',
  'like_for_like',
  'upgrade',
  'cross_vendor',
  'replacement',
]);

function inferSwapType(outgoing, incoming, explicit) {
  const swap = String(explicit || '').trim();
  if (swap && SWAP_TYPES.has(swap)) return swap;
  if (!outgoing || !outgoing.deviceId) return 'commission';
  const oV = String(outgoing.vendor || '').trim().toLowerCase();
  const iV = String(incoming.vendor || '').trim().toLowerCase();
  const oM = String(outgoing.model || outgoing.platform || '').trim().toLowerCase();
  const iM = String(incoming.model || incoming.platform || '').trim().toLowerCase();
  if (oV && iV && oV !== iV) return 'cross_vendor';
  if (oM && iM && oM === iM) return 'like_for_like';
  if (oM && iM && oM !== iM) return 'upgrade';
  return 'replacement';
}

module.exports = {
  PLATFORM_CATALOG,
  profileFromRegistryDev,
  SWAP_TYPES,
  inferSwapType,
};

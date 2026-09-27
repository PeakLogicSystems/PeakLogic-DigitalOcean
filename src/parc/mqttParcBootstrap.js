'use strict';

const persistence = require('../persistence');
const { DEFAULT_MQTT_PARC_BROKER } = require('../config');
const { getMqttCentralHub } = require('./mqttCentralHub');
const { registry } = require('./deviceRegistry');
const { isParcRegistryNoiseId } = require('../devices/bulkAddParcOpta');
const { DEFAULT_GLOBAL_SITE_KEY, normalizeSiteKey } = require('./globalAddressKey');

function mqttParcHubConnectionKey(cfg = {}) {
  const n = defaultMqttParcSettings(cfg);
  return JSON.stringify({
    enabled: !!n.enabled,
    brokerUrl: n.brokerUrl,
    topicPrefix: n.topicPrefix,
    clientId: n.clientId,
    username: n.username,
    password: n.password,
  });
}

function resolveGlobalSiteKey(prev = {}) {
  if (prev.globalSiteKey == null || prev.globalSiteKey === '') return DEFAULT_GLOBAL_SITE_KEY;
  try {
    return normalizeSiteKey(prev.globalSiteKey);
  } catch {
    return DEFAULT_GLOBAL_SITE_KEY;
  }
}

function defaultMqttParcSettings(prev = {}) {
  return {
    enabled: true,
    brokerUrl: String(prev.brokerUrl || DEFAULT_MQTT_PARC_BROKER).trim() || DEFAULT_MQTT_PARC_BROKER,
    topicPrefix: String(prev.topicPrefix || 'peaklogic/v1').trim().replace(/\/+$/, '') || 'peaklogic/v1',
    clientId: prev.clientId || 'peaklogic-central-hmi',
    username: prev.username || '',
    password: prev.password || '',
    autoDiscoverDrivers: prev.autoDiscoverDrivers === true,
    globalSiteKey: resolveGlobalSiteKey(prev),
    cloudTenantIngest: prev.cloudTenantIngest === true
      || process.env.PEAKLOGIC_DEPLOYMENT === 'cloud',
  };
}

function hasEnabledMqttParcDriver(drivers) {
  return (drivers || []).some(
    (d) => (d.type === 'mqtt_parc' || d.type === 'opta_remote') && d.enabled !== false,
  );
}

function mqttParcEnabledUnset(settings) {
  return !settings?.mqttParc || settings.mqttParc.enabled === undefined;
}

function mqttParcExplicitlyDisabled(settings) {
  return settings?.mqttParc?.enabled === false;
}

function shouldAutoEnableMqttParc(settings, drivers) {
  if (mqttParcExplicitlyDisabled(settings)) return false;
  if (mqttParcEnabledUnset(settings) && hasEnabledMqttParcDriver(drivers)) return true;
  if (mqttParcEnabledUnset(settings) && settings?.remoteExecution === true) return true;
  return false;
}

function listFieldParcDeviceIds() {
  return registry.listDevices()
    .map((d) => d.deviceId)
    .filter((id) => id && !isParcRegistryNoiseId(id));
}

function hubBootSkipReason(settings, drivers) {
  if (settings?.mqttParc?.enabled === true) return null;
  if (mqttParcExplicitlyDisabled(settings)) {
    return 'mqttParc.enabled=false — System setup → General → Enable MQTT Parc hub';
  }
  if (!hasEnabledMqttParcDriver(drivers) && settings?.remoteExecution !== true) {
    const regIds = listFieldParcDeviceIds();
    if (regIds.length) {
      const sample = regIds.slice(0, 3).join(', ');
      return `no mqtt_parc driver (Parc registry: ${sample}) — add Opta driver or enable MQTT Parc hub in System setup`;
    }
    return 'no mqtt_parc driver and Remote off — add Opta driver or enable MQTT Parc hub in System setup';
  }
  return 'mqttParc not configured — System setup → Enable MQTT Parc hub';
}

/**
 * Ensure settings.json has mqttParc enabled when an mqtt_parc driver is configured.
 * Does not override an explicit mqttParc.enabled=false from System setup.
 * @returns {{ settings: object, changed: boolean }}
 */
function mergeMqttParcSettings(incoming, prev) {
  const inc = incoming && typeof incoming === 'object' ? incoming : null;
  const base = defaultMqttParcSettings(prev || {});
  if (!inc) return base;
  const merged = { ...base, ...inc };
  if (inc.enabled === undefined && prev && prev.enabled !== undefined) {
    merged.enabled = prev.enabled === true;
  } else if (inc.enabled !== undefined) {
    merged.enabled = inc.enabled === true;
  }
  if (inc.autoDiscoverDrivers === undefined && prev && prev.autoDiscoverDrivers !== undefined) {
    merged.autoDiscoverDrivers = prev.autoDiscoverDrivers === true;
  } else if (inc.autoDiscoverDrivers !== undefined) {
    merged.autoDiscoverDrivers = inc.autoDiscoverDrivers === true;
  }
  if (!inc.brokerUrl && prev?.brokerUrl) merged.brokerUrl = prev.brokerUrl;
  if (inc.globalSiteKey !== undefined) {
    try {
      merged.globalSiteKey = normalizeSiteKey(inc.globalSiteKey);
    } catch {
      merged.globalSiteKey = resolveGlobalSiteKey(prev || {});
    }
  }
  return merged;
}

function ensureMqttParcInSettings(settings, drivers) {
  const next = { ...settings };
  let changed = false;
  if (shouldAutoEnableMqttParc(next, drivers)) {
    const prev = next.mqttParc || {};
    next.mqttParc = {
      ...defaultMqttParcSettings(prev),
      enabled: true,
      autoDiscoverDrivers: prev.autoDiscoverDrivers === true,
    };
    changed = true;
  }
  if (hasEnabledMqttParcDriver(drivers) && next.remoteExecution !== true) {
    next.remoteExecution = true;
    changed = true;
  }
  return { settings: next, changed };
}

async function startMqttParcHubFromSettings(settings) {
  if (!settings?.mqttParc?.enabled) {
    return { started: false, skipped: 'disabled' };
  }
  try {
    await getMqttCentralHub(registry).start(settings.mqttParc);
    return { started: true, status: getMqttCentralHub(registry).status() };
  } catch (err) {
    return { started: false, error: err.message || String(err) };
  }
}

/** Boot + driver-save helper: persist mqttParc if needed and connect hub. */
async function bootstrapMqttParc(options = {}) {
  const settings = options.settings || persistence.readJson('settings.json', {});
  const drivers = options.drivers || persistence.readJson('drivers.json', []);
  const { settings: merged, changed } = ensureMqttParcInSettings(settings, drivers);
  if (changed && options.persist !== false) {
    persistence.writeJson('settings.json', merged);
  }
  const hubResult = await startMqttParcHubFromSettings(merged);
  return { settings: merged, changed, hub: hubResult };
}

/** Connect central MQTT hub from settings (used before Download & Start / driver Connect). */
async function ensureMqttHubConnected(options = {}) {
  let settings = options.settings || persistence.readJson('settings.json', {});
  const drivers = options.drivers || persistence.readJson('drivers.json', []);
  const hub = getMqttCentralHub(registry);
  if (hub.isLive()) {
    return { connected: true, status: hub.status() };
  }
  const ensured = ensureMqttParcInSettings(settings, drivers);
  settings = ensured.settings;
  if (ensured.changed && options.persist !== false) {
    persistence.writeJson('settings.json', settings);
  }
  if (!settings.mqttParc?.enabled) {
    return {
      connected: false,
      error: 'MQTT Parc hub disabled — System setup → General → Enable MQTT Parc hub',
    };
  }
  const boot = await bootstrapMqttParc({ settings, drivers, persist: false });
  if (hub.isLive()) {
    return { connected: true, status: hub.status() };
  }
  return {
    connected: false,
    error: boot.hub?.error
      || `MQTT hub not connected to ${settings.mqttParc?.brokerUrl || 'broker'} — start Mosquitto (npm run mqtt:start) or fix broker URL`,
    hub: boot.hub,
  };
}

module.exports = {
  defaultMqttParcSettings,
  mqttParcHubConnectionKey,
  hasEnabledMqttParcDriver,
  mqttParcEnabledUnset,
  mqttParcExplicitlyDisabled,
  shouldAutoEnableMqttParc,
  hubBootSkipReason,
  mergeMqttParcSettings,
  ensureMqttParcInSettings,
  startMqttParcHubFromSettings,
  bootstrapMqttParc,
  ensureMqttHubConnected,
};

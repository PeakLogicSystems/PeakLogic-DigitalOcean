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
    clientId: prev.clientId || 'mv-central-hmi',
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

/** True when a tenant System setup save may start/stop/reload the process MQTT hub. */
function tenantMqttParcMayReloadHub() {
  return process.env.PEAKLOGIC_DEPLOYMENT !== 'cloud';
}

/**
 * Platform MQTT hub config for cloud SaaS. Always enabled and pinned to
 * PEAKLOGIC_MQTT_BROKER — tenant System setup checkboxes must not move this.
 */
function cloudHubMqttParcSettings(prev = {}) {
  const envBroker = String(process.env.PEAKLOGIC_MQTT_BROKER || '').trim();
  const envUser = String(process.env.MOSQUITTO_USER || process.env.PEAKLOGIC_MQTT_USER || '').trim();
  const envPass = String(process.env.MOSQUITTO_PASS || process.env.PEAKLOGIC_MQTT_PASS || '');
  const base = defaultMqttParcSettings(prev);
  return {
    ...base,
    enabled: true,
    brokerUrl: envBroker || base.brokerUrl,
    username: envUser || prev.username || '',
    password: envPass !== '' ? envPass : (prev.password || ''),
    cloudTenantIngest: true,
  };
}

/** Cloud SaaS: pin mqttParc broker/creds to env so tenant localhost cannot steal the hub. */
function applyCloudMqttParcEnv(settings) {
  if (process.env.PEAKLOGIC_DEPLOYMENT !== 'cloud') {
    return { settings, changed: false };
  }
  const envBroker = String(process.env.PEAKLOGIC_MQTT_BROKER || '').trim();
  if (!envBroker) return { settings, changed: false };

  const next = { ...settings };
  const prev = next.mqttParc || {};
  const pinned = cloudHubMqttParcSettings(prev);
  const same = String(prev.brokerUrl || '') === pinned.brokerUrl
    && String(prev.username || '') === String(pinned.username || '')
    && String(prev.password || '') === String(pinned.password || '')
    && prev.cloudTenantIngest === true
    && prev.enabled !== false;
  if (same) return { settings, changed: false };

  next.mqttParc = {
    ...prev,
    ...pinned,
    enabled: prev.enabled !== false,
    autoDiscoverDrivers: prev.autoDiscoverDrivers === true,
    globalSiteKey: prev.globalSiteKey != null ? prev.globalSiteKey : pinned.globalSiteKey,
  };
  return { settings: next, changed: true };
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
  let settings = options.settings || persistence.readJson('settings.json', {});
  const cloudPatch = applyCloudMqttParcEnv(settings);
  settings = cloudPatch.settings;
  let cloudChanged = cloudPatch.changed;
  if (process.env.PEAKLOGIC_DEPLOYMENT === 'cloud' && !String(process.env.PEAKLOGIC_MQTT_BROKER || '').trim()) {
    console.warn('[mqtt-parc] PEAKLOGIC_MQTT_BROKER unset — cloud hub may listen on localhost instead of mv-mqtt');
  }
  const drivers = options.drivers || persistence.readJson('drivers.json', []);
  const { settings: merged, changed: settingsChanged } = ensureMqttParcInSettings(settings, drivers);
  if ((settingsChanged || cloudChanged) && options.persist !== false) {
    persistence.writeJson('settings.json', merged);
  }
  const hubSettings = process.env.PEAKLOGIC_DEPLOYMENT === 'cloud'
    ? { mqttParc: cloudHubMqttParcSettings(merged.mqttParc) }
    : merged;
  const hubResult = await startMqttParcHubFromSettings(hubSettings);

  let registryLinked = { changed: false, added: [] };
  if (hubResult.started && options.driverManager && merged.mqttParc?.enabled !== false) {
    const { ensureParcDriversFromRegistry } = require('./parcDriverSync');
    registryLinked = await ensureParcDriversFromRegistry({
      driverManager: options.driverManager,
      registry,
      tagStore: options.tagStore,
      syncTags: options.syncRegistryTags === true,
    });
  }

  return {
    settings: merged,
    changed: settingsChanged || cloudChanged || registryLinked.changed,
    hub: hubResult,
    registryLinked,
  };
}

/** Connect central MQTT hub from settings (used before Download & Start / driver Connect). */
async function ensureMqttHubConnected(options = {}) {
  let settings = options.settings || persistence.readJson('settings.json', {});
  const drivers = options.drivers || persistence.readJson('drivers.json', []);
  const hub = getMqttCentralHub(registry);
  if (process.env.PEAKLOGIC_DEPLOYMENT === 'cloud') {
    const mqttParc = cloudHubMqttParcSettings(settings.mqttParc);
    if (!String(process.env.PEAKLOGIC_MQTT_BROKER || mqttParc.brokerUrl || '').trim()) {
      return {
        connected: false,
        error: 'PEAKLOGIC_MQTT_BROKER unset — cloud Parc hub cannot ingest field Optas',
      };
    }
    const hubResult = await startMqttParcHubFromSettings({ mqttParc });
    if (hub.isLive()) {
      return { connected: true, status: hub.status() };
    }
    return {
      connected: false,
      error: hubResult.error
        || `MQTT hub not connected to ${mqttParc.brokerUrl || 'broker'}`,
      hub: hubResult,
    };
  }
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
  applyCloudMqttParcEnv,
  cloudHubMqttParcSettings,
  tenantMqttParcMayReloadHub,
  bootstrapMqttParc,
  ensureMqttHubConnected,
};

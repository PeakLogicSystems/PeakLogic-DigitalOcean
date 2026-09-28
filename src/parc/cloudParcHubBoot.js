'use strict';

const {
  cloudHubMqttParcSettings,
  startMqttParcHubFromSettings,
} = require('./mqttParcBootstrap');
const { getMqttCentralHub } = require('./mqttCentralHub');
const { isFieldParcDeviceId } = require('./optaSerial');

/** Build mqttParc settings for cloud SaaS from env (mv-mqtt broker creds). */
function cloudMqttParcSettingsFromEnv() {
  return cloudHubMqttParcSettings({});
}

/**
 * Start the global Parc MQTT ingest hub on cloud SaaS.
 * Field Optas publish to mqtt.peaklogic.io; this hub fills the fleet parc.json registry.
 */
async function bootstrapCloudParcMqttHub(registry) {
  if (process.env.PEAKLOGIC_DEPLOYMENT !== 'cloud') {
    return { started: false, skipped: 'not cloud' };
  }
  if (typeof registry?.reloadFromPersistence === 'function') {
    registry.reloadFromPersistence();
  }
  const pruned = [];
  if (typeof registry?.listDevices === 'function' && typeof registry?.removeDevice === 'function') {
    for (const d of registry.listDevices()) {
      const id = d.deviceId;
      if (!id || isFieldParcDeviceId(id)) continue;
      if (registry.removeDevice(id)) pruned.push(id);
    }
  }
  if (pruned.length) {
    console.log(`[mqtt-parc] cloud fleet registry pruned ${pruned.length} non-field device(s)`);
  }
  const mqttParc = cloudMqttParcSettingsFromEnv();
  if (!mqttParc.enabled) {
    return { started: false, skipped: 'mqttParc disabled' };
  }
  if (!String(mqttParc.brokerUrl || '').trim()) {
    return {
      started: false,
      error: 'PEAKLOGIC_MQTT_BROKER unset — cloud Parc hub cannot ingest field Optas',
    };
  }
  const hub = getMqttCentralHub(registry);
  const hubResult = await startMqttParcHubFromSettings({ mqttParc });
  return {
    ...hubResult,
    status: hub.status(),
    brokerUrl: mqttParc.brokerUrl,
  };
}

module.exports = {
  cloudMqttParcSettingsFromEnv,
  bootstrapCloudParcMqttHub,
};

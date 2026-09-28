'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  ensureMqttParcInSettings,
  hasEnabledMqttParcDriver,
  hubBootSkipReason,
  defaultMqttParcSettings,
  mergeMqttParcSettings,
  applyCloudMqttParcEnv,
  cloudHubMqttParcSettings,
  tenantMqttParcMayReloadHub,
} = require('../src/parc/mqttParcBootstrap');
const { reconcileMqttParcDriversFromRegistry } = require('../src/devices/bulkAddParcOpta');

describe('mqttParcBootstrap', () => {
  it('enables mqttParc when mqtt_parc driver present', () => {
    const { settings, changed } = ensureMqttParcInSettings(
      { remoteExecution: false },
      [{ id: 'opta_st_01', type: 'mqtt_parc', enabled: true }],
    );
    assert.equal(changed, true);
    assert.equal(settings.mqttParc.enabled, true);
    assert.equal(settings.remoteExecution, true);
  });

  it('hasEnabledMqttParcDriver detects opta_remote', () => {
    assert.equal(
      hasEnabledMqttParcDriver([{ type: 'opta_remote', enabled: true }]),
      true,
    );
  });

  it('does not re-enable mqttParc when user disabled explicitly', () => {
    const { settings, changed } = ensureMqttParcInSettings(
      { mqttParc: { enabled: false, brokerUrl: 'mqtt://x:1883' }, remoteExecution: false },
      [{ id: 'opta_st_01', type: 'mqtt_parc', enabled: true }],
    );
    assert.equal(settings.mqttParc.enabled, false);
    assert.equal(settings.mqttParc.brokerUrl, 'mqtt://x:1883');
    assert.equal(changed, true);
    assert.equal(settings.remoteExecution, true);
  });

  it('auto-enables mqttParc when remoteExecution on and mqttParc unset', () => {
    const { settings, changed } = ensureMqttParcInSettings(
      { remoteExecution: true },
      [{ id: 'mock1', type: 'mock', enabled: true }],
    );
    assert.equal(changed, true);
    assert.equal(settings.mqttParc.enabled, true);
  });

  it('defaultMqttParcSettings defaults autoDiscoverDrivers to false', () => {
    assert.equal(defaultMqttParcSettings({}).autoDiscoverDrivers, false);
    assert.equal(defaultMqttParcSettings({ autoDiscoverDrivers: true }).autoDiscoverDrivers, true);
  });

  it('defaultMqttParcSettings defaults globalSiteKey to 0x0001', () => {
    assert.equal(defaultMqttParcSettings({}).globalSiteKey, 0x0001);
    assert.equal(defaultMqttParcSettings({ globalSiteKey: 0xabcd }).globalSiteKey, 0xabcd);
  });

  it('mergeMqttParcSettings keeps prev enabled when snapshot omits it', () => {
    const merged = mergeMqttParcSettings(
      { brokerUrl: 'mqtt://192.168.1.233:1883' },
      { enabled: true, autoDiscoverDrivers: true, brokerUrl: 'mqtt://192.168.1.233:1883' },
    );
    assert.equal(merged.enabled, true);
    assert.equal(merged.autoDiscoverDrivers, true);
  });

  it('reconcileMqttParcDriversFromRegistry adds missing field devices', () => {
    const registry = {
      listDevices: () => [
        { deviceId: 'opta_0123b636f1c23964ee' },
        { deviceId: 'opta_st_01' },
        { deviceId: 'test-01' },
      ],
    };
    const { drivers, changed, added } = reconcileMqttParcDriversFromRegistry(
      [{ id: 'mock1', type: 'mock', enabled: true }],
      registry,
    );
    assert.equal(changed, true);
    assert.deepEqual(added, ['io_1']);
    assert.equal(drivers.length, 2);
    assert.equal(drivers[1].type, 'mqtt_parc');
    assert.equal(drivers[1].id, 'io_1');
    assert.equal(drivers[1].deviceId, 'opta_0123b636f1c23964ee');
  });

  it('applyCloudMqttParcEnv pins non-local tenant broker to env on cloud', () => {
    const prev = {
      PEAKLOGIC_DEPLOYMENT: process.env.PEAKLOGIC_DEPLOYMENT,
      PEAKLOGIC_MQTT_BROKER: process.env.PEAKLOGIC_MQTT_BROKER,
      MOSQUITTO_USER: process.env.MOSQUITTO_USER,
      MOSQUITTO_PASS: process.env.MOSQUITTO_PASS,
    };
    process.env.PEAKLOGIC_DEPLOYMENT = 'cloud';
    process.env.PEAKLOGIC_MQTT_BROKER = 'mqtts://mqtt.peaklogic.io:8883';
    process.env.MOSQUITTO_USER = 'peaklogic';
    process.env.MOSQUITTO_PASS = 'secret';
    try {
      const { settings, changed } = applyCloudMqttParcEnv({
        mqttParc: { enabled: true, brokerUrl: 'mqtt://127.0.0.1:1883', username: '', password: '' },
      });
      assert.equal(changed, true);
      assert.equal(settings.mqttParc.brokerUrl, 'mqtts://mqtt.peaklogic.io:8883');
      assert.equal(settings.mqttParc.username, 'peaklogic');
      assert.equal(settings.mqttParc.cloudTenantIngest, true);
      const other = applyCloudMqttParcEnv({
        mqttParc: { enabled: true, brokerUrl: 'mqtt://wrong-host:1883' },
      });
      assert.equal(other.settings.mqttParc.brokerUrl, 'mqtts://mqtt.peaklogic.io:8883');
      assert.equal(tenantMqttParcMayReloadHub(), false);
      const hubCfg = cloudHubMqttParcSettings({ enabled: false, brokerUrl: 'mqtt://127.0.0.1:1883' });
      assert.equal(hubCfg.enabled, true);
      assert.equal(hubCfg.brokerUrl, 'mqtts://mqtt.peaklogic.io:8883');
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('hubBootSkipReason mentions Parc registry devices', () => {
    const orig = require('../src/parc/deviceRegistry').registry.listDevices;
    require('../src/parc/deviceRegistry').registry.listDevices = () => [
      { deviceId: 'opta_0123b636f1c23964ee' },
    ];
    try {
      const why = hubBootSkipReason({}, [{ id: 'mock1', type: 'mock' }]);
      assert.match(why, /opta_0123b636f1c23964ee/);
    } finally {
      require('../src/parc/deviceRegistry').registry.listDevices = orig;
    }
  });
});

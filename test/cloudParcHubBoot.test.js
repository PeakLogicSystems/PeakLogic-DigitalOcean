'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('cloudParcHubBoot', () => {
  it('builds mqttParc settings from cloud env', () => {
    const prev = {
      PEAKLOGIC_DEPLOYMENT: process.env.PEAKLOGIC_DEPLOYMENT,
      PEAKLOGIC_MQTT_BROKER: process.env.PEAKLOGIC_MQTT_BROKER,
      MOSQUITTO_USER: process.env.MOSQUITTO_USER,
    };
    process.env.PEAKLOGIC_DEPLOYMENT = 'cloud';
    process.env.PEAKLOGIC_MQTT_BROKER = 'mqtts://mqtt.peaklogic.io:8883';
    process.env.MOSQUITTO_USER = 'peaklogic';
    delete require.cache[require.resolve('../src/parc/cloudParcHubBoot')];
    const { cloudMqttParcSettingsFromEnv } = require('../src/parc/cloudParcHubBoot');
    try {
      const cfg = cloudMqttParcSettingsFromEnv();
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.brokerUrl, 'mqtts://mqtt.peaklogic.io:8883');
      assert.equal(cfg.username, 'peaklogic');
      assert.equal(cfg.cloudTenantIngest, true);
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe('persistence cloud fleet parc.json', () => {
  it('reads and writes parc.json on disk when cloud deployment', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-parc-'));
    const prev = {
      PEAKLOGIC_DEPLOYMENT: process.env.PEAKLOGIC_DEPLOYMENT,
      PEAKLOGIC_DATA: process.env.PEAKLOGIC_DATA,
    };
    process.env.PEAKLOGIC_DEPLOYMENT = 'cloud';
    process.env.PEAKLOGIC_DATA = tmp;
    for (const mod of [
      '../src/config',
      '../src/persistence',
      '../src/tenants/tenantPaths',
    ]) {
      delete require.cache[require.resolve(mod)];
    }
    const persistence = require('../src/persistence');
    try {
      const sample = {
        devices: { opta_test: { deviceId: 'opta_test', lastReportAt: '2026-01-01T00:00:00.000Z' } },
        settings: { enabled: true },
      };
      persistence.writeJson('parc.json', sample);
      const loaded = persistence.readJson('parc.json', null);
      assert.equal(loaded.devices.opta_test.deviceId, 'opta_test');
      assert.ok(fs.existsSync(path.join(tmp, 'parc.json')));
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

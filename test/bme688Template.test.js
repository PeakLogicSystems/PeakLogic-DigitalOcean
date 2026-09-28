'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');
const { parsePayload } = require('../src/drivers/payloadTemplate');
const { envTelemetryTopic } = require('../src/devices/tagBuilders');
const sample = require('../st/fixtures/bme688-telemetry-sample.json');

describe('nexcomm bme688 env mqtt template', () => {
  it('lists BME688 MQTT template', () => {
    const listed = listPresets().find((p) => p.id === 'nexcomm_bme688_env_mqtt');
    assert.ok(listed);
    assert.equal(listed.transport, 'mqtt');
    assert.equal(listed.aiCount, 8);
  });

  it('builds driver with telemetry subscription', () => {
    const { driver } = buildFromPreset('nexcomm_bme688_env_mqtt', {
      deviceId: 'env_lab',
      brokerUrl: 'mqtt://192.168.1.50:1883',
    });
    assert.equal(driver.type, 'mqtt');
    assert.deepEqual(driver.subscriptions, [envTelemetryTopic('env_lab')]);
  });

  it('creates BME688 env tags', () => {
    const topic = envTelemetryTopic('env_01');
    const { tags } = buildFromPreset('nexcomm_bme688_env_mqtt', { deviceId: 'env_01' });
    assert.equal(tags.length, 8);
    const temp = tags.find((t) => t.id === 'BME_TEMP');
    const iaq = tags.find((t) => t.id === 'BME_IAQ');
    assert.equal(temp.driverAddress.topic, topic);
    assert.equal(temp.driverAddress.payloadTemplate, 'json:bme688.temp_C');
    assert.equal(iaq.type, 'INT');
    assert.equal(iaq.driverAddress.payloadTemplate, 'json:bme688.iaq');
  });

  it('parses sample telemetry JSON', () => {
    const payload = JSON.stringify(sample);
    assert.equal(parsePayload(payload, 'json:bme688.temp_C'), 22.6);
    assert.equal(parsePayload(payload, 'json:bme688.rh_pct'), 47.8);
    assert.equal(parsePayload(payload, 'json:bme688.gas_ohm'), 142500);
    assert.equal(parsePayload(payload, 'json:bme688.iaq'), 38);
    assert.equal(parsePayload(payload, 'json:bme688.co2_eq_ppm'), 408);
  });
});

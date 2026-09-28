'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');
const { parsePayload } = require('../src/drivers/payloadTemplate');
const { haloTelemetryTopic } = require('../src/devices/tagBuilders');
const sample = require('../st/fixtures/halo-telemetry-sample.json');

describe('nexcomm halo mqtt template', () => {
  it('lists Halo MQTT template', () => {
    const listed = listPresets().find((p) => p.id === 'nexcomm_halo_mqtt');
    assert.ok(listed);
    assert.equal(listed.transport, 'mqtt');
    assert.equal(listed.sharedBus, false);
    assert.equal(listed.aiCount, 22);
  });

  it('builds driver with telemetry subscription', () => {
    const { driver } = buildFromPreset('nexcomm_halo_mqtt', {
      deviceId: 'halo_lab',
      brokerUrl: 'mqtt://192.168.1.50:1883',
    });
    assert.equal(driver.type, 'mqtt');
    assert.equal(driver.id, 'halo_01');
    assert.deepEqual(driver.subscriptions, [haloTelemetryTopic('halo_lab')]);
  });

  it('creates base + X10 temp/RH tags', () => {
    const topic = haloTelemetryTopic('halo_01');
    const { tags } = buildFromPreset('nexcomm_halo_mqtt', { deviceId: 'halo_01' });
    assert.equal(tags.length, 22);
    const baseTemp = tags.find((t) => t.id === 'BASE_TEMP');
    const x10Rh = tags.find((t) => t.id === 'X10_RH');
    assert.ok(baseTemp);
    assert.ok(x10Rh);
    assert.equal(baseTemp.driverAddress.topic, topic);
    assert.equal(baseTemp.driverAddress.payloadTemplate, 'json:base.temp_C');
    assert.equal(x10Rh.driverAddress.payloadTemplate, 'json:X10.rh_pct');
  });

  it('parses sample telemetry JSON', () => {
    const payload = JSON.stringify(sample);
    assert.equal(parsePayload(payload, 'json:base.temp_C'), 22.4);
    assert.equal(parsePayload(payload, 'json:base.rh_pct'), 48.2);
    assert.equal(parsePayload(payload, 'json:X10.temp_C'), 20.9);
    assert.equal(parsePayload(payload, 'json:X10.rh_pct'), 56.0);
  });
});

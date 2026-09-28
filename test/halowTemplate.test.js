'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');
const { parsePayload } = require('../src/drivers/payloadTemplate');
const { halowTelemetryTopic } = require('../src/devices/tagBuilders');
const sample = require('../st/fixtures/halow-telemetry-sample.json');

describe('nexcomm halow leak mqtt template', () => {
  it('lists HaLoW MQTT template', () => {
    const listed = listPresets().find((p) => p.id === 'nexcomm_halow_leak_mqtt');
    assert.ok(listed);
    assert.equal(listed.transport, 'mqtt');
    assert.equal(listed.diCount, 6);
    assert.equal(listed.aiCount, 12);
  });

  it('builds driver with telemetry subscription', () => {
    const { driver } = buildFromPreset('nexcomm_halow_leak_mqtt', {
      deviceId: 'halow_lab',
      brokerUrl: 'mqtt://192.168.1.50:1883',
    });
    assert.equal(driver.type, 'mqtt');
    assert.deepEqual(driver.subscriptions, [halowTelemetryTopic('halow_lab')]);
  });

  it('creates 6 channels × leak/flow/total tags', () => {
    const topic = halowTelemetryTopic('halow_01');
    const { tags } = buildFromPreset('nexcomm_halow_leak_mqtt', { deviceId: 'halow_01' });
    assert.equal(tags.length, 18);
    const ch2Leak = tags.find((t) => t.id === 'CH2_LEAK');
    const ch6Total = tags.find((t) => t.id === 'CH6_TOTAL');
    assert.equal(ch2Leak.type, 'BOOL');
    assert.equal(ch2Leak.driverAddress.topic, topic);
    assert.equal(ch2Leak.driverAddress.payloadTemplate, 'json:CH2.leak');
    assert.equal(ch6Total.driverAddress.payloadTemplate, 'json:CH6.total_gal');
  });

  it('parses sample telemetry JSON', () => {
    const payload = JSON.stringify(sample);
    assert.equal(parsePayload(payload, 'json:CH1.leak'), false);
    assert.equal(parsePayload(payload, 'json:CH2.leak'), true);
    assert.equal(parsePayload(payload, 'json:CH2.flow_gpm'), 2.35);
    assert.equal(parsePayload(payload, 'json:CH5.total_gal'), 6789.2);
  });
});

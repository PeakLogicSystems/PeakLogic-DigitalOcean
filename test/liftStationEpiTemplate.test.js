'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');
const { parsePayload, formatPayloadForWrite } = require('../src/drivers/payloadTemplate');
const { edgepointEventsTopic, edgepointDeviceboundTopic } = require('../src/devices/tagBuilders');

const SAMPLE_MASTER = fs.readFileSync(
  path.join(__dirname, '../st/fixtures/edgepoint-lift-station-sample.json'),
  'utf8',
);
const SAMPLE_LIGHT = fs.readFileSync(
  path.join(__dirname, '../st/fixtures/edgepoint-liftpoint-light-sample.json'),
  'utf8',
);

describe('lift_station_epi template', () => {
  it('lists EPI lift MQTT template', () => {
    const listed = listPresets().find((p) => p.id === 'lift_station_epi');
    assert.ok(listed);
    assert.equal(listed.transport, 'mqtt');
    assert.equal(listed.stationType, 'dual_duplex');
    assert.equal(listed.defaultProgram, 'logic/36_duplex_lift_station.st');
    assert.equal(listed.hasPdmSeed, true);
  });

  it('builds mqtt driver with events subscription (epi_master)', () => {
    const serialNum = '40a36bce47f3';
    const { driver } = buildFromPreset('lift_station_epi', {
      brokerUrl: 'mqtt://broker.example:1883',
      serialNum,
    });
    assert.equal(driver.id, 'epi_lift1');
    assert.equal(driver.type, 'mqtt');
    assert.equal(driver.serialNum, serialNum);
    assert.deepEqual(driver.subscriptions, [edgepointEventsTopic(serialNum)]);
  });

  it('maps epi_master Nexus registers to ST float ladder (X1_I1–X1_I4)', () => {
    const serialNum = '40a36bce47f3';
    const events = edgepointEventsTopic(serialNum);
    const { tags } = buildFromPreset('lift_station_epi', { serialNum });

    const high = tags.find((t) => t.id === 'X1_I1');
    assert.equal(high.driverAddress.topic, events);
    assert.equal(high.driverAddress.payloadTemplate, 'json:inputs.0.9010');
    assert.equal(parsePayload(SAMPLE_MASTER, high.driverAddress.payloadTemplate), 1);

    const lead = tags.find((t) => t.id === 'X1_I2');
    assert.equal(lead.driverAddress.payloadTemplate, 'json:inputs.3.9040');

    const lag = tags.find((t) => t.id === 'X1_I3');
    assert.equal(lag.driverAddress.payloadTemplate, 'json:inputs.2.9030');

    const off = tags.find((t) => t.id === 'X1_I4');
    assert.equal(off.driverAddress.payloadTemplate, 'json:inputs.4.9050');
  });

  it('includes duplex ST logic memory tags from fixture', () => {
    const { tags } = buildFromPreset('lift_station_epi', { serialNum: '40a36bce47f3' });
    assert.ok(tags.find((t) => t.id === 'ALT1'));
    assert.ok(tags.find((t) => t.id === 'MOTOR1_HRS'));
    assert.ok(!tags.find((t) => t.id === 'X1_I11'));
  });

  it('maps pump contactor outputs to devicebound', () => {
    const serialNum = '40a36bce47f3';
    const devicebound = edgepointDeviceboundTopic(serialNum);
    const { tags } = buildFromPreset('lift_station_epi', { serialNum });
    const r1 = tags.find((t) => t.id === 'R1');
    assert.equal(r1.role, 'output');
    assert.equal(r1.driverAddress.topic, devicebound);
    assert.equal(r1.driverAddress.payloadTemplate, 'edgepoint:output:9410');
    assert.equal(
      formatPayloadForWrite(true, r1.driverAddress.payloadTemplate),
      '{"outputs":[{"reg":9410,"state":1}]}',
    );
  });

  it('maps liftpoint_light profile (Salvation Army)', () => {
    const serialNum = '862406071948166';
    const { tags } = buildFromPreset('lift_station_epi', {
      serialNum,
      liftProfile: 'liftpoint_light',
    });

    const lead = tags.find((t) => t.id === 'X1_I2');
    assert.equal(lead.driverAddress.payloadTemplate, 'json:inputs.1.9020');
    assert.equal(parsePayload(SAMPLE_LIGHT, lead.driverAddress.payloadTemplate), 1);

    const p1Amps = tags.find((t) => t.id === 'AI1');
    assert.equal(parsePayload(SAMPLE_LIGHT, p1Amps.driverAddress.payloadTemplate), 8.25);

    const flow = tags.find((t) => t.id === 'P1_FLOW_1HR_GAL');
    assert.ok(flow);
    assert.equal(parsePayload(SAMPLE_LIGHT, flow.driverAddress.payloadTemplate), 450);
  });
});

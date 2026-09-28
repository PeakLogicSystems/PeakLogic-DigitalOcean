'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildFromPreset } = require('../src/devices/devicePresets');

const ROOT = path.join(__dirname, '..');

describe('nexcomm LPL lift station match', () => {
  it('uses liftpoint_light MQTT paths for CSV columns', () => {
    const align = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'st/fixtures/nexcomm-inbound/nexcomm-lpl-lift-station.alignment.json'),
      'utf8',
    ));
    assert.equal(align.profile, 'liftpoint_light');
    assert.equal(align.matched.length, 16);

    const built = buildFromPreset('nexcomm_lpl_lift_station', {
      serialNum: '862406071948166',
      brokerUrl: 'mqtts://mqtt.peaklogic.io:8883',
    });
    assert.equal(built.driver.type, 'mqtt');
    assert.equal(built.driver.serialNum, '862406071948166');

    const byId = Object.fromEntries(built.tags.map((t) => [t.id, t]));
    assert.equal(byId.X1_I1.driverAddress.payloadTemplate, 'json:inputs.0.9010');
    assert.equal(byId.X1_I5.driverAddress.payloadTemplate, 'json:inputs.2.9030');
    assert.equal(byId.AI1.driverAddress.payloadTemplate, 'json:inputs.6.9070');
    assert.equal(byId.P1_STARTS.driverAddress.payloadTemplate, 'json:in3_starts');
    assert.equal(byId.P1_FLOW_1HR_GAL.driverAddress.payloadTemplate, 'json:s1p1_total_1hr_flow');
    assert.equal(byId.EXT_POWER_OK.driverAddress.payloadTemplate, 'json:battery_power');
    assert.match(byId.X1_I1.driverAddress.topic, /\/devices\/862406071948166\/messages\/events\//);
  });
});

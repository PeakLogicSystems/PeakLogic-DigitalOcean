'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');
const { parsePayload, formatPayloadForWrite } = require('../src/drivers/payloadTemplate');
const { edgepointEventsTopic, edgepointDeviceboundTopic } = require('../src/devices/tagBuilders');

const SAMPLE_GATEWAY = `{
"10":"40a36bcd7113",
"variant":2,
"inputs":[
{"9010":0,"9011":0},
{"9020":1,"9021":0},
{"9030":0,"9031":0},
{"9040":0,"9041":0},
{"9050":0,"9051":0},
{"9060":0,"9061":0},
{"9070":0,"9071":0},
{"9080":0,"9081":0},
{"9090":0,"9091":0},
{"9100":0,"9101":0},
{"9110":0,"9111":0},
{"9120":0,"9121":0},
{"9130":0,"9131":0},
{"9140":0,"9141":0},
{"9150":0,"9151":0},
{"9160":0,"9161":0},
{"9170":0.0007,"9171":3}
],
"outputs":[
{"9410":0,"9411":0},
{"9420":0,"9421":0},
{"9430":0,"9431":0},
{"9440":1,"9441":1}
],
"tz":0,
"dst":0
}`;

describe('edgepoint industrial template', () => {
  it('lists EdgePoint MQTT template', () => {
    const listed = listPresets().find((p) => p.id === 'edgepoint_industrial');
    assert.ok(listed);
    assert.equal(listed.transport, 'mqtt');
    assert.equal(listed.sharedBus, false);
    assert.equal(listed.diCount, 16);
    assert.equal(listed.doCount, 13);
    assert.equal(listed.aiCount, 4);
  });

  it('builds mqtt driver with events subscription and serial number', () => {
    const serialNum = '40a36bcd7113';
    const { driver } = buildFromPreset('edgepoint_industrial', {
      brokerUrl: 'mqtt://broker.example:1883',
      serialNum,
      clientId: 'mv-test',
    });
    assert.equal(driver.id, 'edgepoint1');
    assert.equal(driver.type, 'mqtt');
    assert.equal(driver.brokerUrl, 'mqtt://broker.example:1883');
    assert.equal(driver.clientId, 'mv-test');
    assert.equal(driver.serialNum, serialNum);
    assert.deepEqual(driver.subscriptions, [edgepointEventsTopic(serialNum)]);
  });

  it('maps gateway JSON fields to tag addresses', () => {
    const serialNum = '40a36bcd7113';
    const events = edgepointEventsTopic(serialNum);
    const devicebound = edgepointDeviceboundTopic(serialNum);
    const { tags } = buildFromPreset('edgepoint_industrial', { serialNum });
    assert.equal(tags.length, 69);

    const ac1 = tags.find((t) => t.id === 'EPI_AC_IN1');
    assert.equal(ac1.driverAddress.topic, events);
    assert.equal(ac1.driverAddress.payloadTemplate, 'json:inputs.0.9010');
    assert.equal(parsePayload(SAMPLE_GATEWAY, ac1.driverAddress.payloadTemplate), 0);

    const ac2 = tags.find((t) => t.id === 'EPI_AC_IN2');
    assert.equal(parsePayload(SAMPLE_GATEWAY, ac2.driverAddress.payloadTemplate), 1);

    const an1 = tags.find((t) => t.id === 'EPI_AN1_V');
    assert.equal(an1.type, 'REAL');
    assert.equal(parsePayload(SAMPLE_GATEWAY, an1.driverAddress.payloadTemplate), 0.0007);

    const relayCmd = tags.find((t) => t.id === 'EPI_RELAY1_CMD');
    assert.equal(relayCmd.role, 'output');
    assert.equal(relayCmd.driverAddress.topic, devicebound);
    assert.equal(relayCmd.driverAddress.payloadTemplate, 'edgepoint:output:9410');
    assert.equal(
      formatPayloadForWrite(true, relayCmd.driverAddress.payloadTemplate),
      '{"outputs":[{"reg":9410,"state":1}]}',
    );

    const sink1 = tags.find((t) => t.id === 'EPI_SINK1');
    assert.equal(parsePayload(SAMPLE_GATEWAY, sink1.driverAddress.payloadTemplate), 1);
  });
});

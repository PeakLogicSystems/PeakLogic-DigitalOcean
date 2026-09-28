'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mqttSimHub = require('../src/drivers/mqttSimHub');
const { MqttDriver } = require('../src/drivers/mqttDriver');
const { MqttSimDriver } = require('../src/drivers/mqttSimDriver');
const { TagStore } = require('../src/tags/tagStore');

const BROKER = 'mqtt://127.0.0.1:1883';
const YELV_TOPIC = '/devices/40a36bce47f3/messages/events/';

describe('mqttSimHub + drivers', () => {
  beforeEach(() => {
    mqttSimHub.stop();
    mqttSimHub.stop();
  });

  afterEach(() => {
    mqttSimHub.stop();
    mqttSimHub.stop();
  });

  it('discovers serials from mqtt lift driver subscriptions', () => {
    const stations = mqttSimHub.discoverStationsFromDrivers([
      {
        id: 'ls_yelvington',
        type: 'mqtt',
        enabled: true,
        subscriptions: [YELV_TOPIC],
      },
      { id: 'ls_currie', type: 'mqtt', enabled: true, serialNum: '40a36bcd7bb4' },
    ]);
    assert.equal(stations.length, 2);
    assert.ok(stations.some((s) => s.serialNum === '40a36bce47f3'));
    assert.ok(stations.some((s) => s.serialNum === '40a36bcd7bb4'));
  });

  it('mqtt_sim driver starts hub and mqtt driver reads cached payload', async () => {
    const sim = new MqttSimDriver({ id: 'sim1', type: 'mqtt_sim' });
    await sim.connect({
      brokerUrl: BROKER,
      intervalMs: 60000,
      publishToBroker: false,
      stations: [{ serialNum: '40a36bce47f3' }],
    });
    assert.equal(sim.connected, true);
    assert.equal(mqttSimHub.isRunning(), true);

    const mqtt = new MqttDriver({
      id: 'ls_yelvington',
      type: 'mqtt',
      brokerUrl: BROKER,
      subscriptions: [YELV_TOPIC],
    });
    await mqtt.connect({
      id: 'ls_yelvington',
      type: 'mqtt',
      brokerUrl: BROKER,
      subscriptions: [YELV_TOPIC],
    });
    assert.equal(mqtt.connected, true);
    assert.equal(mqtt._simHub, true);

    const store = new TagStore();
    store.replaceAll([
      {
        id: 'YELV_X1_I1',
        role: 'input',
        driverId: 'ls_yelvington',
        driverAddress: { topic: YELV_TOPIC, payloadTemplate: 'json:inputs.0.9010' },
      },
    ]);

    await mqtt.readBatch(store.list(), store);
    const tag = store.get('YELV_X1_I1');
    assert.equal(tag.quality, 'GOOD');
    assert.equal(tag.value, true);

    await sim.disconnect();
    assert.equal(mqttSimHub.isRunning(), false);
  });
});

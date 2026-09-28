'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createMiscRoutes } = require('../src/api/routes/misc');
const { TagStore } = require('../src/tags/tagStore');
const { MqttParcOptaDriver } = require('../src/drivers/mqttParcOptaDriver');

function listenApp(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => resolve(server));
    server.once('error', reject);
  });
}

describe('misc debug/force remote sync', () => {
  it('POST /debug/force calls syncTagForce on mqtt driver', async () => {
    const sent = [];
    const tagStore = new TagStore();
    tagStore.replaceAll([
      { id: 'R1', type: 'BOOL', role: 'output', value: false, driverId: 'opta_mqtt_st' },
    ]);
    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId: 'opta_st_01',
      remoteExecution: true,
    });
    drv.syncTagForce = async (tag) => {
      sent.push(tag);
      return { ok: true };
    };
    const { registry } = require('../src/parc/deviceRegistry');
    registry.ingestReport({
      deviceId: 'opta_st_01',
      platform: 'arduino-opta-mqtt-st',
      tags: [{ id: 'R1', type: 'BOOL', value: false }],
    });
    const driverManager = {
      configs: [{
        id: 'opta_mqtt_st',
        type: 'mqtt_parc',
        enabled: true,
        deviceId: 'opta_st_01',
      }],
      instances: new Map([['opta_mqtt_st', drv]]),
      _connectCfg: (cfg) => ({ ...cfg, remoteExecution: true }),
    };
    const scanEngine = { remoteExecution: true, loadSettings: () => {} };
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    const app = express();
    app.use(express.json());
    app.use('/api', createMiscRoutes({
      tagStore,
      driverManager,
      scanEngine,
      graphHistory: { clear: () => {} },
    }));
    const server = await listenApp(app);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/debug/force`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagId: 'R1',
          forceOutput: true,
          forceValue: true,
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].id, 'R1');
      assert.equal(sent[0].forceOutput, true);
      assert.equal(sent[0].forceValue, true);
    } finally {
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
      server.close();
    }
  });

  it('POST /debug/force syncs when scanEngine.remoteExecution is false', async () => {
    const sent = [];
    const tagStore = new TagStore();
    tagStore.replaceAll([
      { id: 'R1', type: 'BOOL', role: 'output', value: false, driverId: 'opta_mqtt_st' },
    ]);
    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId: 'opta_st_01',
    });
    drv.syncTagForce = async (tag) => {
      sent.push(tag);
      return { ok: true };
    };
    const { registry } = require('../src/parc/deviceRegistry');
    registry.ingestReport({
      deviceId: 'opta_st_01',
      platform: 'arduino-opta-mqtt-st',
      tags: [{ id: 'R1', type: 'BOOL', value: false }],
    });
    const driverManager = {
      configs: [{
        id: 'opta_mqtt_st',
        type: 'mqtt_parc',
        enabled: true,
        deviceId: 'opta_st_01',
      }],
      instances: new Map([['opta_mqtt_st', drv]]),
      _connectCfg: (cfg) => ({ ...cfg, remoteExecution: true }),
    };
    const scanEngine = { remoteExecution: false, loadSettings: () => {} };
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    const app = express();
    app.use(express.json());
    app.use('/api', createMiscRoutes({
      tagStore,
      driverManager,
      scanEngine,
      graphHistory: { clear: () => {} },
    }));
    const server = await listenApp(app);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/debug/force`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagId: 'R1',
          forceOutput: true,
          forceValue: true,
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(sent.length, 1);
    } finally {
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
      server.close();
    }
  });
});

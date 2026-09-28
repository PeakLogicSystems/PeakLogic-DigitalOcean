'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MqttParcOptaDriver } = require('../src/drivers/mqttParcOptaDriver');
const { registry } = require('../src/parc/deviceRegistry');
const { buildOptaProgramBody } = require('../src/parc/mqttOptaProgram');
const { TagStore } = require('../src/tags/tagStore');

describe('MqttParcOptaDriver', () => {  it('syncs tags from Parc registry', async () => {
    registry.ingestReport({
      deviceId: 'opta_st_01',
      tags: [
        { id: 'I1', type: 'BOOL', value: true },
        { id: 'R1', type: 'BOOL', value: false },
      ],
    });
    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId: 'opta_st_01',
      remoteExecution: true,
    });
    const store = {
      list: () => [{ id: 'I1', type: 'BOOL', driverId: 'opta_mqtt_st', value: false }],
      get: (id) => ({ id, value: false }),
      setValue(id, val) { this._v = val; },
      applyForcesAfterLogic: () => {},
      _v: false,
    };
    await drv.runScanCycle(store);
    assert.equal(store._v, true);
  });

  it('syncTime sends sync_time over MQTT', async () => {
    const sent = [];
    const hub = {
      isLive: () => true,
      sendCommand: async (deviceId, op, body) => {
        sent.push({ deviceId, op, body });
      },
    };
    const orig = require('../src/parc/mqttCentralHub').getMqttCentralHub;
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttCentralHub').getMqttCentralHub = () => hub;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    try {
      const drv = new MqttParcOptaDriver({
        id: 'opta_mqtt_st',
        type: 'mqtt_parc',
        deviceId: 'opta_st_01',
      });
      drv._hub = () => hub;
      const r = await drv.syncTime();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].op, 'sync_time');
      assert.equal(sent[0].deviceId, 'opta_st_01');
      assert.ok(Number(sent[0].body.unixUtc) > 1577836800);
      assert.equal(typeof sent[0].body.tzOffsetMin, 'number');
      assert.equal(r.ok, true);
    } finally {
      require('../src/parc/mqttCentralHub').getMqttCentralHub = orig;
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
    }
  });

  it('syncTagForce sends set_force without remoteExecution flag on driver', async () => {
    const sent = [];
    const hub = {
      isLive: () => true,
      sendCommand: async (deviceId, op, body) => {
        sent.push({ deviceId, op, body });
      },
    };
    const orig = require('../src/parc/mqttCentralHub').getMqttCentralHub;
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttCentralHub').getMqttCentralHub = () => hub;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    try {
      const drv = new MqttParcOptaDriver({
        id: 'opta_mqtt_st',
        type: 'mqtt_parc',
        deviceId: 'opta_st_01',
        remoteExecution: false,
      });
      drv._hub = () => hub;
      await drv.syncTagForce({
        id: 'R1',
        forceOutput: true,
        forceValue: true,
        value: true,
      });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].op, 'set_force');
    } finally {
      require('../src/parc/mqttCentralHub').getMqttCentralHub = orig;
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
    }
  });

  it('syncTagForce sends set_force over MQTT when remoteExecution', async () => {
    const sent = [];
    const hub = {
      isLive: () => true,
      sendCommand: async (deviceId, op, body) => {
        sent.push({ deviceId, op, body });
      },
    };
    const orig = require('../src/parc/mqttCentralHub').getMqttCentralHub;
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttCentralHub').getMqttCentralHub = () => hub;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    try {
      const drv = new MqttParcOptaDriver({
        id: 'opta_mqtt_st',
        type: 'mqtt_parc',
        deviceId: 'opta_st_01',
        remoteExecution: true,
      });
      drv._hub = () => hub;
      await drv.syncTagForce({
        id: 'R1',
        forceOutput: true,
        forceValue: true,
        value: true,
      });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].op, 'set_force');
      assert.equal(sent[0].body.tagId, 'R1');
      assert.equal(sent[0].body.forceValue, true);
    } finally {
      require('../src/parc/mqttCentralHub').getMqttCentralHub = orig;
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
    }
  });

  it('ensureConnected delegates to connect', async () => {
    registry.ingestReport({
      deviceId: 'opta_st_01',
      tags: [{ id: 'I1', type: 'BOOL', value: true }],
    });
    const hub = {
      status: () => ({ connected: false, brokerUrl: 'mqtt://127.0.0.1:1883' }),
      isLive: () => false,
      sendCommand: async () => {},
      start: async () => {},
    };
    const drv = new MqttParcOptaDriver({
      id: 'opta_st_01',
      type: 'mqtt_parc',
      deviceId: 'opta_st_01',
    });
    drv._hub = () => hub;
    const orig = require('../src/parc/mqttCentralHub').getMqttCentralHub;
    require('../src/parc/mqttCentralHub').getMqttCentralHub = () => hub;
    try {
      assert.equal(typeof drv.ensureConnected, 'function');
      const ok = await drv.ensureConnected();
      assert.equal(ok, false);
      assert.match(drv._lastError, /hub (not connected|disabled)/i);
    } finally {
      require('../src/parc/mqttCentralHub').getMqttCentralHub = orig;
    }
  });

  it('getProgramTrace expands deploy traceMap with device telemetry', () => {
    const src = 'IF IsON(I1) THEN TurnON(R1); END_IF;';
    const tagStore = new TagStore();
    tagStore.replaceAll([
      { id: 'I1', type: 'BOOL', role: 'input', value: true },
      { id: 'R1', type: 'BOOL', role: 'output', value: false },
    ]);
    const built = buildOptaProgramBody(src, tagStore, 'opta_mqtt_st');
    assert.ok(built.ok);
    assert.ok(built.traceMap.length > 0);

    registry.ingestReport({
      deviceId: 'opta_st_01',
      programTrace: [[0, 1], [1, 0]],
      tags: [],
    });

    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId: 'opta_st_01',
      remoteExecution: true,
    });
    drv._traceMap = built.traceMap;
    assert.equal(drv.isTracePending(), false);
    const rows = drv.getProgramTrace();
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.start != null && r.end != null && r.kind));
  });

  it('isTracePending is true until telemetry programTrace arrives', () => {
    const deviceId = 'opta_trace_pending';
    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId,
    });
    drv._traceMap = [{ k: 'bool', s: 1, e: 5 }];
    registry.ingestReport({ deviceId, tags: [], programTrace: [] });
    assert.equal(drv.isTracePending(), true);
    registry.ingestReport({
      deviceId,
      programTrace: [[0, 1]],
      tags: [],
    });
    assert.equal(drv.isTracePending(), false);
  });

  it('stopRuntime detaches device and clears debug config', async () => {
    const deviceId = 'opta_stop_detach';
    registry.attach(deviceId, { sessionId: 'test' });
    const published = [];
    const hub = {
      isLive: () => true,
      sendCommand: async (id, op) => {
        assert.equal(id, deviceId);
        assert.equal(op, 'runtime_stop');
      },
      publishDeviceConfig: (id, patch) => {
        published.push({ id, patch });
      },
    };
    const orig = require('../src/parc/mqttCentralHub').getMqttCentralHub;
    require('../src/parc/mqttCentralHub').getMqttCentralHub = () => hub;
    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId,
    });
    drv._hub = () => hub;
    try {
      await drv.stopRuntime();
      assert.equal(registry.getDevice(deviceId).attach.active, false);
      assert.equal(published.length, 1);
      assert.equal(published[0].patch.debugAttached, false);
    } finally {
      require('../src/parc/mqttCentralHub').getMqttCentralHub = orig;
    }
  });

  it('writeBatch sends write_outputs when remoteExecution off and device remote_io', async () => {
    const sent = [];
    const hub = {
      isLive: () => true,
      sendCommand: async (deviceId, op, body) => {
        sent.push({ deviceId, op, body });
      },
    };
    const orig = require('../src/parc/mqttCentralHub').getMqttCentralHub;
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttCentralHub').getMqttCentralHub = () => hub;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    try {
      registry.ingestReport({
        deviceId: 'opta_st_01',
        deviceMode: 'remote_io',
        tags: [],
      });
      const drv = new MqttParcOptaDriver({
        id: 'opta_mqtt_st',
        type: 'mqtt_parc',
        deviceId: 'opta_st_01',
        remoteExecution: false,
      });
      drv._hub = () => hub;
      const store = {
        get: (id) => ({ id, value: id === 'R1' }),
      };
      await drv.writeBatch([
        { id: 'R1', role: 'output', type: 'BOOL' },
        { id: 'I1', role: 'input', type: 'BOOL' },
      ], store);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].op, 'write_outputs');
      assert.deepEqual(sent[0].body.outputs, { R1: true });
    } finally {
      require('../src/parc/mqttCentralHub').getMqttCentralHub = orig;
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
    }
  });

  it('writeBatch skips when device is standalone', async () => {
    const sent = [];
    const hub = {
      isLive: () => true,
      sendCommand: async (deviceId, op, body) => {
        sent.push({ deviceId, op, body });
      },
    };
    registry.ingestReport({
      deviceId: 'opta_st_01',
      deviceMode: 'standalone',
      tags: [],
    });
    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId: 'opta_st_01',
      remoteExecution: false,
    });
    drv._hub = () => hub;
    await drv.writeBatch([{ id: 'R1', role: 'output', type: 'BOOL' }], { get: () => ({ value: true }) });
    assert.equal(sent.length, 0);
  });

  it('shouldSkipNvDeploy when telemetry CRC matches bytecode', () => {
    const { bcDeployCrc } = require('../src/drivers/optaProtocol');
    const tagStore = {
      list: () => [
        { id: 'I1', type: 'BOOL', role: 'input', driverId: 'opta_mqtt_st' },
        { id: 'R1', type: 'BOOL', role: 'output', driverId: 'opta_mqtt_st' },
      ],
    };
    const src = 'IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;';
    const built = buildOptaProgramBody(src, tagStore, 'opta_mqtt_st');
    assert.equal(built.ok, true);
    const crc = bcDeployCrc(built.body.bc);
    registry.ingestReport({
      deviceId: 'opta_st_01',
      runtime: { programOk: true, programFromNv: true, programNvCrc: crc, running: true },
    });
    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId: 'opta_st_01',
    });
    assert.equal(drv.shouldSkipNvDeploy(built, 'opta_st_01'), true);
    assert.equal(drv.shouldSkipNvDeploy(built, 'opta_st_02'), false);
  });
});

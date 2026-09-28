'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pushRemoteTagForce, resolveForceDeviceId } = require('../src/api/pushRemoteTagForce');
const { registry } = require('../src/parc/deviceRegistry');
const { MqttParcOptaDriver } = require('../src/drivers/mqttParcOptaDriver');

describe('pushRemoteTagForce', () => {
  it('syncs force when PC runtime never started (remoteExecution unset on scanEngine)', async () => {
    const sent = [];
    const drv = new MqttParcOptaDriver({
      id: 'opta_st_01',
      type: 'mqtt_parc',
      deviceId: 'opta_st_01',
    });
    drv.syncTagForce = async (tag, opts) => {
      sent.push({ tag, opts });
      return { ok: true };
    };
    registry.ingestReport({
      deviceId: 'opta_st_01',
      platform: 'arduino-opta-mqtt-st',
      tags: [{ id: 'R1', type: 'BOOL', value: false }],
    });
    const driverManager = {
      configs: [{
        id: 'opta_st_01',
        type: 'mqtt_parc',
        enabled: true,
        deviceId: 'opta_st_01',
      }],
      instances: new Map([['opta_st_01', drv]]),
      _connectCfg: (cfg) => ({ ...cfg, remoteExecution: true }),
    };
    const scanEngine = { remoteExecution: false, loadSettings: () => {} };
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    try {
      const result = await pushRemoteTagForce(driverManager, scanEngine, {
        id: 'R1',
        driverId: 'opta_st_01',
        forceOutput: true,
        forceValue: true,
      });
      assert.equal(result.ok, true);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].opts.deviceId, 'opta_st_01');
    } finally {
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
    }
  });

  it('redirects stale template tag driverId to sole live mqtt_parc driver', async () => {
    const liveId = 'opta_0123b636f1c23964ee';
    const sent = [];
    const drv = new MqttParcOptaDriver({
      id: liveId,
      type: 'mqtt_parc',
      deviceId: liveId,
      ateccSerial: '0123b636f1c23964ee',
    });
    drv.syncTagForce = async (tag, opts) => {
      sent.push({ tag, opts });
      return { ok: true };
    };
    registry.ingestReport({
      deviceId: liveId,
      platform: 'arduino-opta-mqtt-st',
      ateccSerial: '0123b636f1c23964ee',
      tags: [{ id: 'R1', type: 'BOOL', value: false }],
    });
    const driverManager = {
      configs: [{
        id: liveId,
        type: 'mqtt_parc',
        enabled: true,
        deviceId: liveId,
        ateccSerial: '0123b636f1c23964ee',
      }],
      instances: new Map([[liveId, drv]]),
      _connectCfg: (cfg) => ({ ...cfg, remoteExecution: true }),
    };
    const scanEngine = { remoteExecution: false, loadSettings: () => {} };
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    try {
      const result = await pushRemoteTagForce(driverManager, scanEngine, {
        id: 'R1',
        driverId: 'opta_st_01',
        forceOutput: true,
        forceValue: true,
      });
      assert.equal(result.ok, true);
      assert.equal(result.driverId, liveId);
      assert.equal(result.deviceId, liveId);
      assert.equal(result.redirected, true);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].opts.deviceId, liveId);
    } finally {
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
    }
  });

  it('redirects stale template tag driverId on force clear (DELETE path)', async () => {
    const liveId = `opta_force_clear_${Date.now()}`;
    const sent = [];
    const drv = new MqttParcOptaDriver({
      id: liveId,
      type: 'mqtt_parc',
      deviceId: liveId,
    });
    drv.syncTagForce = async (tag, opts) => {
      sent.push({ tag, opts });
      return { ok: true };
    };
    registry.ingestReport({
      deviceId: liveId,
      platform: 'arduino-opta-mqtt-st',
      tags: [{ id: 'R1', type: 'BOOL', value: false }],
    });
    const driverManager = {
      configs: [{
        id: liveId,
        type: 'mqtt_parc',
        enabled: true,
        deviceId: liveId,
      }],
      instances: new Map([[liveId, drv]]),
      _connectCfg: (cfg) => cfg,
    };
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    try {
      const result = await pushRemoteTagForce(driverManager, null, {
        id: 'R1',
        driverId: 'opta_st_01',
      });
      assert.equal(result.ok, true);
      assert.equal(result.redirected, true);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].opts.deviceId, liveId);
    } finally {
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
    }
  });

  it('redirects offline template driver to another live mqtt_parc driver', () => {
    const liveId = `opta_force_live_${Date.now()}`;
    registry.ingestReport({
      deviceId: liveId,
      platform: 'arduino-opta-mqtt-st',
      tags: [],
    });
    const templateId = `opta_force_tpl_${Date.now()}`;
    const driverManager = {
      configs: [
        { id: templateId, type: 'mqtt_parc', enabled: true, deviceId: templateId },
        { id: `${templateId}_hw`, type: 'mqtt_parc', enabled: true, deviceId: liveId },
      ],
    };
    const resolved = resolveForceDeviceId({
      id: templateId,
      deviceId: templateId,
      type: 'mqtt_parc',
    }, driverManager);
    assert.equal(resolved, liveId);
  });

  it('throws when driver device is offline and no live Opta exists', () => {
    const offlineId = `opta_force_missing_${Date.now()}`;
    assert.throws(
      () => resolveForceDeviceId({ id: offlineId, deviceId: offlineId }),
      /not reachable/i,
    );
  });

  it('skips tags without driverId', async () => {
    const result = await pushRemoteTagForce(
      { configs: [], instances: new Map() },
      {},
      { id: 'LOCAL', driverId: null },
    );
    assert.equal(result.skipped, true);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TagStore } = require('../src/tags/tagStore');
const { MqttParcOptaDriver } = require('../src/drivers/mqttParcOptaDriver');
const { getFleetRegistry } = require('../src/parc/deviceRegistry');
const { syncMqttParcLiveIo } = require('../src/parc/parcLiveIoSync');

describe('Parc Live I/O sync', () => {
  it('copies fleet telemetry into the Studio tag store', async () => {
    const fleet = getFleetRegistry();
    fleet.ingestReport({
      deviceId: 'mv_liveio_sync_01',
      tags: [
        { id: 'I1', type: 'BOOL', value: true },
        { id: 'R1', type: 'BOOL', value: false },
      ],
    });
    const store = new TagStore();
    store.upsert({ id: 'I1', type: 'BOOL', role: 'input', driverId: 'arduino_opta_st', value: false });
    store.upsert({ id: 'R1', type: 'BOOL', role: 'output', driverId: 'arduino_opta_st', value: true });
    const drv = new MqttParcOptaDriver({
      id: 'arduino_opta_st',
      type: 'mqtt_parc',
      deviceId: 'mv_liveio_sync_01',
    });
    const driverManager = {
      instances: new Map([['arduino_opta_st', drv]]),
    };
    syncMqttParcLiveIo(store, driverManager);
    assert.equal(store.get('I1').value, true);
    assert.equal(store.get('R1').value, false);
  });

  it('copies fleet telemetry when the tenant has no mqtt_parc driver', () => {
    const fleet = getFleetRegistry();
    fleet.ingestReport({
      deviceId: 'mv_liveio_nodriver_01',
      platform: 'arduino-opta',
      tags: [
        { id: 'ALT_OFF', type: 'BOOL', value: true },
        { id: 'MOTOR1_HOA', type: 'INT', value: 1 },
        { id: 'LVL_LEAD', type: 'BOOL', value: true },
      ],
    });
    const store = new TagStore();
    store.upsert({ id: 'ALT_OFF', type: 'BOOL', role: 'memory', value: false });
    store.upsert({ id: 'MOTOR1_HOA', type: 'INT', role: 'memory', value: 0 });
    store.upsert({ id: 'LVL_LEAD', type: 'BOOL', role: 'memory', value: false });
    syncMqttParcLiveIo(store, {
      instances: new Map(),
      configs: [{ id: 'arduino_opta_st', type: 'mqtt_parc', deviceId: 'mv_liveio_nodriver_01', enabled: true }],
    });
    assert.equal(store.get('ALT_OFF').value, true);
    assert.equal(store.get('MOTOR1_HOA').value, 1);
    assert.equal(store.get('LVL_LEAD').value, true);
  });

  it('adds expansion I/O tags from telemetry and still syncs when many Optas are live', () => {
    const fleet = getFleetRegistry();
    fleet.ingestReport({
      deviceId: 'mv_other_opta_99',
      platform: 'arduino-opta',
      tags: [{ id: 'I1', type: 'BOOL', value: false }],
    });
    fleet.ingestReport({
      deviceId: 'mv_liveio_hw_01',
      platform: 'arduino-opta',
      tags: [
        { id: 'X1_I2', type: 'BOOL', role: 'input', value: true },
        { id: 'X1_I4', type: 'BOOL', role: 'memory', value: true },
        { id: 'LVL_OFF', type: 'BOOL', role: 'memory', value: true },
        { id: 'MOTOR1_HOA', type: 'INT', value: 0 },
      ],
    });
    const store = new TagStore();
    store.upsert({ id: 'MOTOR1_HOA', type: 'INT', role: 'memory', value: 0 });
    store.upsert({ id: 'LVL_OFF', type: 'BOOL', role: 'memory', value: false });
    syncMqttParcLiveIo(store, {
      instances: new Map(),
      configs: [{ id: 'arduino_opta_st', type: 'mqtt_parc', deviceId: 'mv_liveio_hw_01', enabled: true }],
    });
    assert.equal(store.get('X1_I2').value, true);
    assert.equal(store.get('X1_I2').role, 'input');
    assert.equal(store.get('X1_I4').value, true);
    assert.equal(store.get('LVL_OFF').value, true);
  });
});

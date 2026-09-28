'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TagStore } = require('../src/tags/tagStore');
const { createContext } = require('../src/engine/executor');
const { MqttParcOptaDriver } = require('../src/drivers/mqttParcOptaDriver');
const { registry } = require('../src/parc/deviceRegistry');

describe('force mux model', () => {
  it('tagStore keeps logicValue separate from forced effective value', () => {
    const store = new TagStore();
    store.replaceAll([{ id: 'Q', type: 'BOOL', role: 'output', value: false }]);
    store.setForce('Q', { forceOutput: true, forceValue: true });
    const t = store.get('Q');
    assert.equal(t.value, true);
    assert.equal(t.logicValue, false);
    store.setValue('Q', true);
    assert.equal(store.get('Q').logicValue, true);
    assert.equal(store.get('Q').value, true);
    store.clearForce('Q');
    assert.equal(store.get('Q').value, true);
    assert.equal(store.get('Q').logicValue, true);
  });

  it('applyForcesAfterLogic refreshes effective without overwriting logic', () => {
    const store = new TagStore();
    store.replaceAll([{ id: 'Q', type: 'BOOL', role: 'output', value: false }]);
    store.setForce('Q', { forceOutput: true, forceValue: true });
    store.setValue('Q', false);
    store.applyForcesAfterLogic();
    const t = store.get('Q');
    assert.equal(t.logicValue, false);
    assert.equal(t.value, true);
  });

  it('executor writes logic while output is forced', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'I1', type: 'BOOL', role: 'input', value: false },
      { id: 'R1', type: 'BOOL', role: 'output', value: false },
    ]);
    store.setForce('R1', { forceOutput: true, forceValue: true });
    const ctx = createContext(store);
    ctx.setBool('R1', false);
    const t = store.get('R1');
    assert.equal(t.logicValue, false);
    assert.equal(t.value, true);
    store.applyForcesAfterLogic();
    assert.equal(t.value, true);
  });

  it('mqttParcOptaDriver syncs effective, logic, and force fields', async () => {
    registry.ingestReport({
      deviceId: 'opta_mux',
      tags: [
        {
          id: 'R1',
          type: 'BOOL',
          value: true,
          logicValue: false,
          forceOutput: true,
          forceValue: true,
        },
      ],
    });
    const store = new TagStore();
    store.replaceAll([{ id: 'R1', type: 'BOOL', role: 'output', driverId: 'opta_mqtt_st', value: false }]);
    const drv = new MqttParcOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_parc',
      deviceId: 'opta_mux',
      remoteExecution: true,
    });
    await drv.runScanCycle(store);
    const t = store.get('R1');
    assert.equal(t.value, true);
    assert.equal(t.logicValue, false);
    assert.equal(t.forceOutput, true);
    assert.equal(t.forceValue, true);
  });
});

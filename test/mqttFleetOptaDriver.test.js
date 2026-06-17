'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MqttFleetOptaDriver } = require('../src/drivers/mqttFleetOptaDriver');
const { registry } = require('../src/fleet/deviceRegistry');

describe('MqttFleetOptaDriver', () => {
  it('syncs tags from fleet registry', async () => {
    registry.ingestReport({
      deviceId: 'opta_st_01',
      tags: [
        { id: 'I1', type: 'BOOL', value: true },
        { id: 'R1', type: 'BOOL', value: false },
      ],
    });
    const drv = new MqttFleetOptaDriver({
      id: 'opta_mqtt_st',
      type: 'mqtt_fleet',
      deviceId: 'opta_st_01',
      remoteExecution: true,
    });
    const store = {
      list: () => [{ id: 'I1', type: 'BOOL', driverId: 'opta_mqtt_st', value: false }],
      get: (id) => ({ id, value: false }),
      setValue(id, val) { this._v = val; },
      _v: false,
    };
    await drv.runScanCycle(store);
    assert.equal(store._v, true);
  });
});

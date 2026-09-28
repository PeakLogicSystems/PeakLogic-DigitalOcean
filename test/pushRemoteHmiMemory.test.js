'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveHmiMemoryDeviceId,
  pushRemoteHmiMemory,
  pushRemoteHmiMemoryMany,
} = require('../src/api/pushRemoteHmiMemory');
const { getFleetRegistry } = require('../src/parc/deviceRegistry');

describe('resolveHmiMemoryDeviceId', () => {
  it('uses the sole live Opta when the tenant has no mqtt_parc driver', () => {
    const fleet = getFleetRegistry();
    fleet.ingestReport({
      deviceId: 'mv_hmi_write_01',
      platform: 'arduino-opta',
      tags: [{ id: 'MOTOR1_HOA', type: 'INT', value: 0 }],
    });
    const id = resolveHmiMemoryDeviceId({
      configs: [{ id: 'arduino_opta_st', type: 'mqtt_parc', deviceId: 'mv_hmi_write_01', enabled: true }],
      instances: new Map(),
    });
    assert.equal(id, 'mv_hmi_write_01');
  });
});

describe('pushRemoteHmiMemoryMany', () => {
  it('skips non-memory tags', async () => {
    const r = await pushRemoteHmiMemory({ configs: [] }, {}, {
      id: 'DO1',
      role: 'output',
      value: true,
    });
    assert.equal(r.skipped, true);
    assert.equal(r.reason, 'not memory');
  });

  it('sends HOA + START + HAND in one writeMemoryMany call', async () => {
    const fleet = getFleetRegistry();
    const deviceId = `mv_hmi_batch_${Date.now()}`;
    fleet.ingestReport({
      deviceId,
      platform: 'arduino-opta',
      tags: [{ id: 'MOTOR1_START', type: 'BOOL', value: false }],
    });
    const calls = [];
    const drv = {
      writeMemoryMany: async (tags, opts) => {
        calls.push({ tags, opts });
        return { ok: true, deviceId };
      },
    };
    const result = await pushRemoteHmiMemoryMany(
      {
        configs: [{ id: 'opta', type: 'mqtt_parc', deviceId, enabled: true }],
        instances: new Map([['opta', drv]]),
      },
      { remoteExecution: true },
      [
        { id: 'MOTOR1_HOA', role: 'memory', type: 'INT', value: 2 },
        { id: 'MOTOR1_START', role: 'memory', type: 'BOOL', value: true },
        { id: 'MOTOR1_HAND', role: 'memory', type: 'BOOL', value: true },
      ],
    );
    assert.equal(result.ok, true);
    assert.equal(result.deviceId, deviceId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tags.length, 3);
    assert.equal(calls[0].opts.deviceId, deviceId);
    assert.equal(calls[0].tags[1].id, 'MOTOR1_START');
    assert.equal(calls[0].tags[2].value, true);
  });
});

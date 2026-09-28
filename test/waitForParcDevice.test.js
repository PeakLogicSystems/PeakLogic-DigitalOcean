'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { registry } = require('../src/parc/deviceRegistry');
const { waitForParcDeviceTelemetry } = require('../src/parc/waitForParcDevice');

describe('waitForParcDeviceTelemetry', () => {
  it('returns immediately when telemetry is fresh', async () => {
    registry.ingestReport({
      deviceId: 'opta_wait_test',
      tags: [{ id: 'I1', type: 'BOOL', value: true }],
    });
    const r = await waitForParcDeviceTelemetry('opta_wait_test', { timeoutMs: 2000 });
    assert.equal(r.ok, true);
    assert.equal(r.device.deviceId, 'opta_wait_test');
  });

  it('fails when device never appears', async () => {
    const r = await waitForParcDeviceTelemetry('opta_missing_xyz', { timeoutMs: 400 });
    assert.equal(r.ok, false);
    assert.match(r.error, /not seen on MQTT/i);
  });
});

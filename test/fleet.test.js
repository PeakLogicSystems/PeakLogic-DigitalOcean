'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DeviceRegistry } = require('../src/fleet/deviceRegistry');

describe('DeviceRegistry', () => {
  it('ingests report and lists device', () => {
    const reg = new DeviceRegistry();
    reg.updateSettings({ enabled: true });
    const r = reg.ingestReport({
      deviceId: 'test-01',
      name: 'Test Device',
      platform: 'rpi-aarch64',
      reportIntervalSec: 120,
      runtime: { running: true, scanMs: 100 },
      tags: [{ id: 'DI1', type: 'BOOL', value: true }],
      driverHealth: [],
    });
    assert.equal(r.ok, true);
    assert.equal(r.nextReportSec, 120);
    const row = reg.listDevices().find((d) => d.deviceId === 'test-01');
    assert.ok(row);
    assert.equal(row.tagCount, 1);
  });

  it('attach pauses reports', () => {
    const reg = new DeviceRegistry();
    reg.updateSettings({ enabled: true });
    reg.ingestReport({ deviceId: 'dbg-01', tags: [] });
    reg.attach('dbg-01', { host: '192.168.1.50', port: 3080 });
    const cfg = reg.reporterConfig('dbg-01');
    assert.equal(cfg.pauseReports, true);
    const ack = reg.ingestReport({ deviceId: 'dbg-01', tags: [] });
    assert.equal(ack.pauseReports, true);
    reg.detach('dbg-01');
    const ack2 = reg.ingestReport({ deviceId: 'dbg-01', tags: [] });
    assert.equal(ack2.pauseReports, false);
  });
});

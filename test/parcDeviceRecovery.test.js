'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

function loadRecovery() {
  delete require.cache[require.resolve('../src/persistence')];
  delete require.cache[require.resolve('../src/parc/deviceRegistry')];
  delete require.cache[require.resolve('../src/parc/parcDeviceRecovery')];
  return require('../src/parc/parcDeviceRecovery');
}

function loadRegistry() {
  delete require.cache[require.resolve('../src/persistence')];
  delete require.cache[require.resolve('../src/parc/deviceRegistry')];
  return require('../src/parc/deviceRegistry');
}

describe('parcDeviceRecovery', () => {
  beforeEach(() => {
    loadRecovery().resetParcRecoveryState();
  });

  it('debounces recovery per device', async () => {
    const { maybeRecoverParcDevice } = loadRecovery();
    const published = [];
    const hub = {
      isLive: () => true,
      publishDeviceConfig: (_id, patch) => { published.push(patch); return true; },
    };
    const drv = { cfg: { scanMs: 100 }, startRuntime: async () => {} };
    const scanEngine = { running: true, ast: { remote: true } };
    const driverManager = {
      configs: [{ id: 'd1', type: 'mqtt_parc', enabled: true, deviceId: 'dev-01' }],
      instances: new Map([['d1', drv]]),
    };
    const opts = {
      settings: { remoteExecution: true, scanMs: 100 },
      scanEngine,
      driverManager,
      hub,
    };

    const first = await maybeRecoverParcDevice('dev-01', opts);
    assert.equal(first.ok, true);
    assert.equal(published.length, 1);

    const second = await maybeRecoverParcDevice('dev-01', opts);
    assert.equal(second.skipped, true);
    assert.equal(second.reason, 'debounced');
    assert.equal(published.length, 1);
  });

  it('calls startRuntime when device runtime is not running', async () => {
    const { maybeRecoverParcDevice } = loadRecovery();
    const { DeviceRegistry } = loadRegistry();
    const reg = new DeviceRegistry();
    reg.updateSettings({ enabled: true });
    reg.ingestReport({
      deviceId: 'dev-02',
      tags: [],
      runtime: { running: false, programOk: true },
    });

    const published = [];
    const startCalls = [];
    const hub = {
      isLive: () => true,
      publishDeviceConfig: (_id, patch) => { published.push(patch); return true; },
    };
    const drv = {
      cfg: { scanMs: 100, reportIntervalMs: 200 },
      startRuntime: async (opts) => { startCalls.push(opts); },
    };
    const scanEngine = { running: true, ast: { remote: true } };
    const driverManager = {
      configs: [{ id: 'd2', type: 'mqtt_parc', enabled: true, deviceId: 'dev-02' }],
      instances: new Map([['d2', drv]]),
    };

    const result = await maybeRecoverParcDevice('dev-02', {
      settings: { remoteExecution: true },
      scanEngine,
      driverManager,
      hub,
      registry: reg,
      force: true,
    });

    assert.equal(result.ok, true);
    assert.equal(published.length, 1);
    assert.equal(published[0].pauseTelemetry, false);
    assert.equal(published[0].debugAttached, true);
    assert.equal(startCalls.length, 1);
    assert.equal(startCalls[0].deviceId, 'dev-02');
    assert.equal(startCalls[0].attach, true);
  });

  it('starts Opta ST when remoteExecution is on even if PC scan is stopped', async () => {
    const { maybeRecoverParcDevice } = loadRecovery();
    const startCalls = [];
    const result = await maybeRecoverParcDevice('dev-04', {
      settings: { remoteExecution: true },
      scanEngine: { running: false },
      driverManager: {
        configs: [{ id: 'd4', type: 'mqtt_parc', enabled: true, deviceId: 'dev-04' }],
        instances: new Map([['d4', { cfg: { scanMs: 100 }, startRuntime: async () => { startCalls.push(1); } }]]),
      },
      hub: { isLive: () => true, publishDeviceConfig: () => true },
      registry: { getDevice: () => ({ runtime: { running: false, programOk: true } }) },
      force: true,
    });
    assert.equal(result.ok, true);
    assert.equal(startCalls.length, 1);
  });

  it('skips when remoteExecution is off', async () => {
    const { maybeRecoverParcDevice } = loadRecovery();
    const result = await maybeRecoverParcDevice('dev-03', {
      settings: { remoteExecution: false },
      hub: { isLive: () => true, publishDeviceConfig: () => true },
      force: true,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'remoteExecution off');
  });

  it('starts Opta ST when allowWithoutRemote is set', async () => {
    const { maybeRecoverParcDevice } = loadRecovery();
    const startCalls = [];
    const result = await maybeRecoverParcDevice('dev-05', {
      settings: { remoteExecution: false },
      allowWithoutRemote: true,
      driverManager: {
        configs: [{ id: 'd5', type: 'mqtt_parc', enabled: true, deviceId: 'dev-05' }],
        instances: new Map([['d5', { cfg: { scanMs: 100 }, startRuntime: async () => { startCalls.push(1); } }]]),
      },
      hub: { isLive: () => true, publishDeviceConfig: () => true },
      registry: { getDevice: () => ({ runtime: { running: false } }) },
      force: true,
    });
    assert.equal(result.ok, true);
    assert.equal(startCalls.length, 1);
  });
});

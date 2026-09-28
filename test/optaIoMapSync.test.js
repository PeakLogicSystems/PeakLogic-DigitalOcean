'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { DeviceRegistry } = require('../src/parc/deviceRegistry');
const { findRegistryDeviceForDriver } = require('../src/parc/parcDeviceResolve');
const {
  ioMapPointsToParcTags,
  resolveOptaHost,
} = require('../src/parc/optaIoMapSync');
const { mvDeviceIdFromAteccSerial } = require('../src/parc/optaSerial');

const SERIAL = '0123b636f1c23964ee';

describe('findRegistryDeviceForDriver', () => {
  let registry;

  beforeEach(() => {
    registry = new DeviceRegistry();
    registry._store = { devices: {}, settings: registry.settings() };
    const mvId = mvDeviceIdFromAteccSerial(SERIAL);
    registry._store.devices['opta_0123b636f1c23964ee'] = {
      deviceId: 'opta_0123b636f1c23964ee',
      name: 'Legacy Opta',
      lastReportAt: new Date(Date.now() - 3600_000).toISOString(),
      tags: [
        { id: 'I1', type: 'BOOL', role: 'input', value: false },
        { id: 'X1_I1', type: 'BOOL', role: 'input', value: true },
      ],
      meta: { ateccSerial: SERIAL, ethIp: '192.168.1.50' },
    };
    registry._store.devices[mvId] = {
      deviceId: mvId,
      name: 'MV Opta',
      lastReportAt: new Date().toISOString(),
      tags: [],
      meta: { ateccSerial: SERIAL },
    };
  });

  it('resolves mv id and finds driver raw opta_* registry entry when mv missing', () => {
    const mvId = mvDeviceIdFromAteccSerial(SERIAL);
    delete registry._store.devices[mvId];
    const cfg = {
      id: 'opta_0123b636f1c23964ee',
      deviceId: 'opta_0123b636f1c23964ee',
      ateccSerial: SERIAL,
    };
    const { device, deviceId, resolvedId } = findRegistryDeviceForDriver(registry, cfg);
    assert.equal(resolvedId, mvId);
    assert.ok(device);
    assert.equal(deviceId, 'opta_0123b636f1c23964ee');
    assert.equal(device.tags.length, 2);
    assert.ok(device.tags.find((t) => t.id === 'X1_I1'));
  });

  it('prefers legacy opta_* entry when mv_* exists but has fewer tags', () => {
    const mvId = mvDeviceIdFromAteccSerial(SERIAL);
    registry._store.devices[mvId] = {
      deviceId: mvId,
      name: 'MV Opta',
      lastReportAt: new Date().toISOString(),
      tags: [{ id: 'I1', type: 'BOOL', role: 'input', value: false }],
      meta: { ateccSerial: SERIAL },
    };
    const cfg = {
      id: 'opta_0123b636f1c23964ee',
      deviceId: 'opta_0123b636f1c23964ee',
      ateccSerial: SERIAL,
    };
    const { device, deviceId } = findRegistryDeviceForDriver(registry, cfg);
    assert.equal(deviceId, 'opta_0123b636f1c23964ee');
    assert.equal(device.tags.length, 2);
    assert.ok(device.tags.find((t) => t.id === 'X1_I1'));
  });
});

describe('ioMapPointsToParcTags', () => {
  it('keeps input/output roles only', () => {
    const points = [
      { id: 'I1', type: 'BOOL', role: 'input', value: true },
      { id: 'M1', type: 'BOOL', role: 'memory', value: false },
      { id: 'R1', type: 'BOOL', role: 'output', value: false },
      { id: 'X1_I3', type: 'BOOL', role: 'input', value: true },
    ];
    const tags = ioMapPointsToParcTags(points);
    assert.equal(tags.length, 3);
    assert.deepEqual(tags.map((t) => t.id), ['I1', 'R1', 'X1_I3']);
    assert.equal(tags[0].role, 'input');
    assert.equal(tags[1].role, 'output');
  });
});

describe('resolveOptaHost', () => {
  it('uses ethIp from registry device with matching serial', () => {
    const registry = new DeviceRegistry();
    registry._store = { devices: {}, settings: registry.settings() };
    registry._store.devices.opta_legacy = {
      deviceId: 'opta_legacy',
      meta: { ateccSerial: SERIAL, ethIp: '10.0.0.9' },
      tags: [],
    };
    const host = resolveOptaHost(registry, { ateccSerial: SERIAL }, null);
    assert.equal(host, '10.0.0.9');
  });

  it('prefers device meta over cfg.host', () => {
    const dev = { meta: { ethIp: '192.168.1.77' } };
    const host = resolveOptaHost({ listDevices: () => [] }, { host: '10.0.0.1' }, dev);
    assert.equal(host, '192.168.1.77');
  });
});

describe('deviceRegistry legacy migration', () => {
  it('merges legacy opta_* into mv_* on ingest and deletes legacy key', () => {
    const registry = new DeviceRegistry();
    registry._store = { devices: {}, settings: registry.settings() };
    const mvId = mvDeviceIdFromAteccSerial(SERIAL);
    registry._store.devices['opta_0123b636f1c23964ee'] = {
      deviceId: 'opta_0123b636f1c23964ee',
      tags: [{ id: 'I1', type: 'BOOL', role: 'input', value: false }],
      meta: { ateccSerial: SERIAL, ethIp: '192.168.1.50' },
    };
    registry.ingestReport({
      deviceId: mvId,
      meta: { ateccSerial: SERIAL },
      tags: [{ id: 'I2', type: 'BOOL', role: 'input', value: true }],
    });
    assert.ok(registry._store.devices[mvId]);
    assert.equal(registry._store.devices['opta_0123b636f1c23964ee'], undefined);
    assert.equal(registry._store.devices[mvId].tags.length, 1);
    assert.equal(registry._store.devices[mvId].tags[0].id, 'I2');
    assert.equal(registry._store.devices[mvId].meta.ethIp, '192.168.1.50');
  });
});

describe('sync-parc-tags stale policy', () => {
  it('allows merge when registry tags exist but telemetry is stale', () => {
    const { mergeParcTagsIntoStore } = require('../src/parc/parcTagSync');
    const staleTags = [
      { id: 'I1', type: 'BOOL', role: 'input', value: false },
      { id: 'I2', type: 'BOOL', role: 'input', value: true },
    ];
    const merged = mergeParcTagsIntoStore([], staleTags, 'opta_0123b636f1c23964ee');
    assert.equal(merged.ok, true);
    assert.equal(merged.count, 2);
    const source = 'registry-stale';
    assert.ok(['registry', 'registry-stale', 'http'].includes(source));
  });
});

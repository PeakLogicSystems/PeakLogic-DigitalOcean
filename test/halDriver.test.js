'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseHalAddress, formatPin, isReadable, isWritable } = require('../src/hal/parseChannel');
const { SimHalBackend } = require('../src/hal/simBackend');
const { HalDriver } = require('../src/drivers/halDriver');
const { TagStore } = require('../src/tags/tagStore');

describe('HAL parseChannel', () => {
  it('parses pin strings', () => {
    assert.deepStrictEqual(parseHalAddress({ pin: 'DI3' }), { kind: 'di', index: 3, field: undefined });
    assert.deepStrictEqual(parseHalAddress({ pin: 'CNT1', field: 'freq' }), {
      kind: 'cnt', index: 1, field: 'freq',
    });
  });

  it('parses kind/index form', () => {
    assert.deepStrictEqual(parseHalAddress({ kind: 'ao', index: 2 }), { kind: 'ao', index: 2, field: undefined });
  });

  it('formatPin round-trips', () => {
    assert.strictEqual(formatPin('di', 0), 'DI0');
  });

  it('read/write kinds', () => {
    assert.strictEqual(isReadable('di'), true);
    assert.strictEqual(isWritable('do'), true);
    assert.strictEqual(isWritable('di'), false);
  });
});

describe('SimHalBackend', () => {
  it('reads and writes DO/AO', async () => {
    const be = new SimHalBackend({ limits: { di: 4, do: 4, ai: 2, ao: 2, cnt: 2 } });
    await be.connect();
    be.write('do', 0, 1);
    assert.strictEqual(be.read('do', 0), 1);
    be.write('ao', 1, 3.5);
    assert.strictEqual(be.read('ao', 1), 3.5);
  });

  it('increments counter on DI edge', async () => {
    const be = new SimHalBackend({
      limits: { di: 4, do: 4, ai: 2, ao: 2, cnt: 2 },
      counterBindings: { 0: { pulseDi: 'DI0' } },
    });
    await be.connect();
    be.maps.di.set(0, false);
    be.read('cnt', 0);
    be.maps.di.set(0, true);
    const c1 = be.read('cnt', 0);
    be.maps.di.set(0, false);
    be.read('cnt', 0);
    be.maps.di.set(0, true);
    const c2 = be.read('cnt', 0);
    assert.ok(c1 >= 1);
    assert.ok(c2 > c1);
  });
});

describe('HalDriver', () => {
  it('readBatch maps tags to HAL pins', async () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'DI1', type: 'BOOL', role: 'input', value: false, driverId: 'hal0', driverAddress: { pin: 'DI0' } },
      { id: 'Q1', type: 'BOOL', role: 'output', value: true, driverId: 'hal0', driverAddress: { pin: 'DO0' } },
    ]);
    const drv = new HalDriver({
      id: 'hal0',
      type: 'hal',
      backend: 'sim',
      simValues: { DI0: true },
    });
    await drv.connect(drv.cfg);
    await drv.readBatch(store.list().filter((t) => t.role === 'input'), store);
    assert.strictEqual(store.get('DI1').value, true);
    await drv.writeBatch(store.list().filter((t) => t.role === 'output'), store);
    assert.strictEqual(drv.getStatus().do.DO0, true);
  });
});

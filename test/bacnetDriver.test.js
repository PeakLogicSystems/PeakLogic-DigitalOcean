'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTagAddress,
  parsePresentValue,
  coerceForTag,
  tagIdForPoint,
  resolveObjectType,
  resolvePropertyId,
} = require('../src/drivers/bacnetConstants');
const { mergeBacnetTagsIntoStore } = require('../src/drivers/bacnetTagSync');

describe('bacnetConstants', () => {
  it('resolves object type names and property ids', () => {
    assert.equal(resolveObjectType('analogInput'), 0);
    assert.equal(resolveObjectType('binaryOutput'), 4);
    assert.equal(resolvePropertyId('presentValue'), 85);
  });

  it('normalizes tag driverAddress', () => {
    const addr = normalizeTagAddress({
      host: '10.0.0.5',
      deviceInstance: 1001,
      objectType: 'analogInput',
      objectInstance: 3,
      property: 'presentValue',
    });
    assert.equal(addr.host, '10.0.0.5');
    assert.equal(addr.objectType, 0);
    assert.equal(addr.objectInstance, 3);
    assert.equal(addr.property, 85);
  });

  it('parses present values for tag coercion', () => {
    const Bacnet = require('node-bacnet');
    const appTag = Bacnet.enum.ApplicationTag;
    const parsed = parsePresentValue({
      values: [{ type: appTag.REAL, value: 72.5 }],
    });
    assert.equal(parsed.ok, true);
    assert.equal(coerceForTag(parsed, 'REAL'), 72.5);
    assert.equal(coerceForTag({ ok: true, value: 1 }, 'BOOL'), true);
  });

  it('builds stable tag ids', () => {
    const id = tagIdForPoint(1001, 0, 7, 85);
    assert.match(id, /^BAC_1001_/);
  });
});

describe('bacnetTagSync', () => {
  it('merges imported points into tag store', () => {
    const points = [{
      host: '192.168.1.10',
      deviceInstance: 200,
      objectType: 0,
      objectTypeLabel: 'analogInput',
      objectInstance: 1,
      objectName: 'Space Temp',
      property: 85,
      propertyLabel: 'PRESENT_VALUE',
      suggestedTagType: 'REAL',
    }];
    const r = mergeBacnetTagsIntoStore([], points, 'bacnet1');
    assert.equal(r.ok, true);
    assert.equal(r.added, 1);
    assert.equal(r.tags[0].driverId, 'bacnet1');
    assert.equal(r.tags[0].driverAddress.host, '192.168.1.10');
  });
});

describe('bacnetDriver write policy', () => {
  it('blocks writes unless writeEnabled is true', async () => {
    const { BacnetDriver } = require('../src/drivers/bacnetDriver');
    const drv = new BacnetDriver({ id: 'bacnet1', writeEnabled: false });
    drv.connected = true;
    drv.client = {
      writeProperty: async () => { throw new Error('should not call'); },
    };
    const store = {
      get: () => ({ value: 72 }),
      list: () => [],
    };
    await drv.writeBatch([{ id: 'T1', type: 'REAL', driverAddress: { host: '10.0.0.1', objectType: 0, objectInstance: 1 } }], store);
    assert.match(drv._lastError, /writes disabled/i);
  });
});

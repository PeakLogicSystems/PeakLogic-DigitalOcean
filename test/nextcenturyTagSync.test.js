'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildNextcenturyTags,
  mergeNextcenturyTagsIntoStore,
  wireSemanticTagsFromDescriptions,
  normalizeDescriptionTagId,
  inferFieldForSemanticTag,
  tagIdFor,
  fieldsForDevice,
} = require('../src/drivers/nextcenturyTagSync');
const { parseRt4510Row } = require('../src/drivers/nextcenturyDriver');
const {
  loadNextcenturySample,
  buildDeviceCacheFromSample,
} = require('./helpers/nextcenturySampleMock');

describe('nextcenturyTagSync', () => {
  it('tagIdFor sanitizes device ids', () => {
    assert.equal(tagIdFor('FA003195', 'USAGE'), 'NC_FA003195_USAGE');
    assert.equal(tagIdFor('11F01BBC', 'TEMP'), 'NC_11F01BBC_TEMP');
  });

  it('fieldsForDevice adds leak tag for leak sensors only', () => {
    const leak = parseRt4510Row(['', 'Wet', '', 'Bath', '', 'Leak Sensor', '70', 'FA1', '', '1', '0', '10', '', ''], 1);
    const meter = parseRt4510Row(['', 'Dry', '', 'Kitchen', '', 'Meter', '72', 'FA2', '', '1', '0', '10', '', ''], 1);
    assert.ok(fieldsForDevice(leak).some((f) => f.field === 'leakActive'));
    assert.ok(!fieldsForDevice(meter).some((f) => f.field === 'leakActive'));
  });

  it('fieldsForDevice adds interval kWh for electric meters', () => {
    const electric = parseRt4510Row([
      '', '', '', '', '11F01BBC', 'Integrated Electric Meter', '80.6', '11F01BBC',
      'EZ Meter - E (NextCentury Embedded)', '117', '27903.84', '28020.84', '1', 'Power meter',
    ], 39990);
    const fields = fieldsForDevice(electric);
    assert.ok(fields.some((f) => f.field === 'totalUsage' && f.suffix === 'USAGE'));
    assert.ok(fields.some((f) => f.field === 'currentReading' && f.suffix === 'INTERVAL'));
  });

  it('buildNextcenturyTags from sample cache matches fixture ids', () => {
    const sample = loadNextcenturySample();
    const cache = buildDeviceCacheFromSample(sample);
    const tags = buildNextcenturyTags(cache, 'nextcentury1', { _deviceCount: cache.size, _lastCollectEpoch: 1 });
    const ids = new Set(tags.map((t) => t.id));
    assert.ok(ids.has('NC_STATUS_DEVICES'));
    assert.ok(ids.has('NC_FA003195_USAGE'));
    assert.ok(ids.has('NC_FA0032A8_LEAK'));
    assert.ok(ids.has('NC_11F01BBC_USAGE'));
    assert.ok(ids.has('NC_11F01BBC_INTERVAL'));
  });

  it('normalizeDescriptionTagId handles portal casing and whitespace', () => {
    assert.equal(normalizeDescriptionTagId('RM101_Toilet_Leak'), 'RM101_TOILET_LEAK');
    assert.equal(normalizeDescriptionTagId('\t KITCH_SINK1_SINK_LEAK'), 'KITCH_SINK1_SINK_LEAK');
    assert.equal(normalizeDescriptionTagId('Electric meter'), '');
    assert.equal(normalizeDescriptionTagId('Temp measurement'), '');
  });

  it('wireSemanticTagsFromDescriptions wires unit 3 RM101 rows from NC descriptions', () => {
    const cache = new Map([
      ['FA003A90', {
        deviceId: 'FA003A90',
        description: 'RM101_AC_PAN_LEAK',
        deviceType: 'Leak Sensor',
        leakStatus: 'Leak',
      }],
      ['FA003190', {
        deviceId: 'FA003190',
        description: 'RM101_Toilet_Leak',
        deviceType: 'Leak Sensor',
        leakStatus: 'No Leak',
      }],
    ]);
    const tags = [
      { id: 'RM101_AC_PAN_LEAK', role: 'input', type: 'BOOL' },
      { id: 'RM101_TOILET_LEAK', role: 'input', type: 'BOOL' },
      { id: 'NC_FA003A90_LEAK', driverId: 'nextcentury1', ncAuto: true },
    ];
    const { tags: out, wired } = wireSemanticTagsFromDescriptions(tags, cache, 'nextcentury1');
    assert.equal(wired.length, 2);
    const pan = out.find((t) => t.id === 'RM101_AC_PAN_LEAK');
    const toilet = out.find((t) => t.id === 'RM101_TOILET_LEAK');
    assert.equal(pan.driverId, 'nextcentury1');
    assert.equal(pan.driverAddress.deviceId, 'FA003A90');
    assert.equal(pan.driverAddress.field, 'leakActive');
    assert.equal(toilet.driverAddress.deviceId, 'FA003190');
  });

  it('mergeNextcenturyTagsIntoStore wires semantic tags from descriptions on sync', () => {
    const sample = loadNextcenturySample();
    const cache = buildDeviceCacheFromSample(sample);
    cache.set('FA003A90', {
      deviceId: 'FA003A90',
      description: 'RM101_AC_PAN_LEAK',
      deviceType: 'Leak Sensor',
      leakStatus: 'No Leak',
    });
    const existing = [
      { id: 'RM101_AC_PAN_LEAK', role: 'input', type: 'BOOL' },
    ];
    const merged = mergeNextcenturyTagsIntoStore(existing, cache, 'nextcentury1', {
      _deviceCount: cache.size,
      _lastCollectEpoch: 1,
    });
    assert.equal(merged.ok, true);
    const pan = merged.tags.find((t) => t.id === 'RM101_AC_PAN_LEAK');
    assert.equal(pan.driverId, 'nextcentury1');
    assert.equal(pan.driverAddress.deviceId, 'FA003A90');
    assert.ok((merged.descriptionWired || []).some((w) => w.tagId === 'RM101_AC_PAN_LEAK'));
  });

  it('mergeNextcenturyTagsIntoStore strips stale/duplicate NC_ variants but keeps manual tags', () => {
    const sample = loadNextcenturySample();
    const cache = buildDeviceCacheFromSample(sample);
    const existing = [
      // Canonical auto tag (should be rebuilt, not duplicated).
      { id: 'NC_FA003195_USAGE', driverId: 'nextcentury1', ncAuto: true },
      // Malformed "second group" variants that the old regex never recognized.
      { id: 'NC__FA003195_LEAK', driverId: 'nextcentury1' },
      { id: 'NC_FA_003195_TEMP', driverId: 'nextcentury1' },
      // Manual alias on the same driver — must survive.
      { id: 'RM101_AC_PAN_LEAK', driverId: 'nextcentury1', ncAuto: false },
      // Unrelated tag on another driver — must survive.
      { id: 'PUMP_RUN', driverId: 'modbus1' },
    ];
    const merged = mergeNextcenturyTagsIntoStore(existing, cache, 'nextcentury1', {
      _deviceCount: cache.size,
      _lastCollectEpoch: 1,
    });
    assert.equal(merged.ok, true);
    const ids = merged.tags.map((t) => t.id);
    assert.ok(!ids.includes('NC__FA003195_LEAK'), 'malformed variant removed');
    assert.ok(!ids.includes('NC_FA_003195_TEMP'), 'malformed variant removed');
    assert.ok(ids.includes('RM101_AC_PAN_LEAK'), 'manual alias kept');
    assert.ok(ids.includes('PUMP_RUN'), 'other-driver tag kept');
    // No duplicate ids anywhere.
    assert.equal(new Set(ids).size, ids.length, 'no duplicate tag ids');
  });

  it('mergeNextcenturyTagsIntoStore does not double up stale/variant tags left on a deleted driver', () => {
    const sample = loadNextcenturySample();
    const cache = buildDeviceCacheFromSample(sample);
    // Leftover NC device tags under an OLD/deleted driver id, one using an older
    // "NC__" formatting variant. Before the fix these lingered next to the fresh
    // canonical tags and doubled the list.
    const existing = [
      { id: 'NC_FA003195_USAGE', driverId: 'old_nc', ncAuto: true },
      { id: 'NC__FA003195_LEAK', driverId: 'old_nc', ncAuto: true },
      { id: 'NC_FA0032A8_LEAK', driverId: 'old_nc', ncAuto: true },
    ];
    const merged = mergeNextcenturyTagsIntoStore(existing, cache, 'nextcentury1', {
      _deviceCount: cache.size,
      _lastCollectEpoch: 1,
    });
    assert.equal(merged.ok, true);
    const ids = merged.tags.map((t) => t.id);
    // Exactly one tag per canonical device group — no doubles.
    const groups = ids.map((id) => (/^NC_/i.test(id) ? id.replace(/_+/g, '_').toUpperCase() : id));
    assert.equal(new Set(groups).size, groups.length, 'no duplicate NC device groups');
    // The variant id is gone; the canonical one remains on the live driver.
    assert.ok(!ids.includes('NC__FA003195_LEAK'), 'stale variant removed');
    assert.ok(ids.includes('NC_FA003195_LEAK'), 'canonical rebuilt');
    const usage = merged.tags.find((t) => t.id === 'NC_FA003195_USAGE');
    assert.equal(usage.driverId, 'nextcentury1', 're-homed onto the live driver');
  });

  it('mergeNextcenturyTagsIntoStore keeps NC tags on another driver for devices not in this report', () => {
    const sample = loadNextcenturySample();
    const cache = buildDeviceCacheFromSample(sample);
    // A second NC driver owns a device that is NOT part of this report. We must
    // only reclaim duplicates of devices we are actually (re)creating, never wipe
    // an unrelated driver's tags.
    const existing = [
      { id: 'NC_ZZ999999_USAGE', driverId: 'nextcentury2', ncAuto: true },
    ];
    const merged = mergeNextcenturyTagsIntoStore(existing, cache, 'nextcentury1', {
      _deviceCount: cache.size,
      _lastCollectEpoch: 1,
    });
    assert.equal(merged.ok, true);
    const ids = merged.tags.map((t) => t.id);
    assert.ok(ids.includes('NC_ZZ999999_USAGE'), 'unrelated other-driver NC tag kept');
    assert.ok(ids.includes('NC_FA003195_USAGE'), 'this report still syncs');
    const groups = ids.map((id) => (/^NC_/i.test(id) ? id.replace(/_+/g, '_').toUpperCase() : id));
    assert.equal(new Set(groups).size, groups.length, 'no duplicate groups');
  });

  it('mergeNextcenturyTagsIntoStore preserves labels', () => {
    const sample = loadNextcenturySample();
    const cache = buildDeviceCacheFromSample(sample);
    const existing = [{
      id: 'NC_FA003195_USAGE',
      label: 'Custom bathroom label',
      driverId: 'nextcentury1',
      ncAuto: true,
    }];
    const merged = mergeNextcenturyTagsIntoStore(existing, cache, 'nextcentury1', {
      _deviceCount: cache.size,
      _lastCollectEpoch: 99,
    });
    assert.equal(merged.ok, true);
    const kept = merged.tags.find((t) => t.id === 'NC_FA003195_USAGE');
    assert.equal(kept.label, 'Custom bathroom label');
    assert.equal(merged.tags.filter((t) => t.driverId === 'nextcentury1').length, merged.count);
  });
});

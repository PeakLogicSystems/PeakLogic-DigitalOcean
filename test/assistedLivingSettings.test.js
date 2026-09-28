'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  MAX_POOLS,
  MAX_FILTER_PUMPS,
  MAX_SITE_FILTER_PUMPS,
  normalizeAssistedLiving,
  normalizePools,
  normalizeFilterPumpCount,
  normalizeCirculationHours,
  syncAssistedLivingTags,
  syncNextcenturySemanticTags,
  mergedSemanticMap,
  patchAssistedLivingHmi,
} = require('../src/settings/assistedLivingSettings');

describe('assistedLivingSettings', () => {
  it('enforces site pool and pump limits', () => {
    assert.equal(MAX_POOLS, 4);
    assert.equal(MAX_FILTER_PUMPS, 2);
    assert.equal(MAX_SITE_FILTER_PUMPS, 8);
    assert.equal(normalizeFilterPumpCount(9, 1), 2);
    assert.equal(normalizeFilterPumpCount(0, 1), 1);
  });

  it('normalizeAssistedLiving updates pool sanitizer without dropping other fields', () => {
    const prev = {
      mechWhGas: false,
      pools: [{
        id: 'therapy',
        tagPrefix: 'POOL',
        name: 'Therapy Pool',
        sanitizer: 'orp',
        waterType: 'fresh',
        filterPumpCount: 1,
      }],
    };
    const next = normalizeAssistedLiving({
      pools: [{ ...prev.pools[0], sanitizer: 'cl2' }],
    }, prev);
    assert.equal(next.pools[0].sanitizer, 'cl2');
    assert.equal(next.mechWhGas, false);
  });

  it('normalizePools caps at four bodies of water', () => {
    const raw = Array.from({ length: 6 }, (_, i) => ({
      id: `pool${i + 1}`,
      tagPrefix: `P${i + 1}`,
      name: `Pool ${i + 1}`,
    }));
    assert.equal(normalizePools(raw).length, 4);
  });

  it('normalizePoolEntry keeps shared water link and circulation hours', () => {
    const pools = normalizePools([
      { id: 'main', tagPrefix: 'POOL', name: 'Main Pool', bodyKind: 'pool', circulationHoursPerDay: 7 },
      { id: 'spa', tagPrefix: 'SPA', name: 'Spa', bodyKind: 'spa', sharedWaterWith: 'main', circulationHoursPerDay: 0.5 },
    ]);
    assert.equal(pools[1].bodyKind, 'spa');
    assert.equal(pools[1].sharedWaterWith, 'main');
    assert.equal(pools[1].circulationHoursPerDay, 0.5);
    assert.equal(pools[0].bodyKind, 'pool');
    assert.equal(pools[0].sharedWaterWith, '');
  });

  it('normalizePools supports water feature on shared plumbing', () => {
    const pools = normalizePools([
      { id: 'main', tagPrefix: 'POOL', name: 'Main Pool', bodyKind: 'pool' },
      {
        id: 'bubbler',
        tagPrefix: 'FEAT',
        name: 'Bubbler',
        bodyKind: 'water_feature',
        sharedWaterWith: 'main',
        circulationHoursPerDay: 1,
      },
    ]);
    assert.equal(pools[1].bodyKind, 'water_feature');
    assert.equal(pools[1].sharedWaterWith, 'main');
    assert.equal(pools[1].circulationHoursPerDay, 1);
  });

  it('legacy sharedWaterWith without bodyKind infers spa', () => {
    const pools = normalizePools([
      { id: 'main', tagPrefix: 'POOL', name: 'Main Pool' },
      { id: 'spa', tagPrefix: 'SPA', name: 'Spa', sharedWaterWith: 'main' },
    ]);
    assert.equal(pools[1].bodyKind, 'spa');
    assert.equal(pools[1].sharedWaterWith, 'main');
  });

  it('normalizeCirculationHours clamps to quarter-hour steps', () => {
    assert.equal(normalizeCirculationHours(0.1, 7), 0.25);
    assert.equal(normalizeCirculationHours(30, 7), 24);
    assert.equal(normalizeCirculationHours(6.6, 7), 6.5);
  });

  it('syncAssistedLivingTags toggles ORP/CL2 and second pump enable', () => {
    const values = new Map();
    const tagStore = {
      get: (id) => (values.has(id) ? { id, value: values.get(id) } : { id, value: false }),
      setValue: (id, value) => values.set(id, value),
    };
    ['POOL_CFG_USE_ORP', 'POOL_CFG_USE_CL2', 'POOL_CFG_SALT', 'POOL_CFG_FRESH', 'POOL_CFG_FP_CNT', 'POOL_CFG_FP2'].forEach((id) => {
      values.set(id, id.endsWith('ORP') || id.endsWith('FRESH') ? true : false);
    });
    syncAssistedLivingTags(tagStore, {
      pools: normalizePools([{
        id: 'therapy',
        tagPrefix: 'POOL',
        name: 'Therapy Pool',
        sanitizer: 'cl2',
        waterType: 'fresh',
        filterPumpCount: 2,
      }]),
    });
    assert.equal(values.get('POOL_CFG_USE_ORP'), false);
    assert.equal(values.get('POOL_CFG_USE_CL2'), true);
    assert.equal(values.get('POOL_CFG_FP_CNT'), 2);
    assert.equal(values.get('POOL_CFG_FP2'), true);
  });

  it('syncNextcenturySemanticTags wires kitchen freezer when MECH meter absent', () => {
    const tags = [{
      id: 'KITCH_FREEZER_TEMP',
      label: 'Freezer',
      type: 'REAL',
      role: 'input',
      value: -5,
    }];
    const tagStore = {
      list: () => tags,
      get: (id) => tags.find((t) => t.id === id),
      replaceAll: (next) => {
        tags.length = 0;
        tags.push(...next);
      },
    };
    syncAssistedLivingTags(tagStore, {
      nextCentury: {
        driverId: 'nextcentury1',
        semanticMap: [
          { tagId: 'KITCH_FREEZER_TEMP', deviceId: 'BC0077DF', field: 'temperature' },
        ],
      },
    });
    assert.equal(tags[0].driverAddress.deviceId, 'BC0077DF');
    assert.equal(tags[0].driverId, 'nextcentury1');
  });

  it('syncNextcenturySemanticTags wires MECH meter tags and adds interval tag', () => {
    const tags = [{
      id: 'MECH_METER_KWH',
      label: 'Site meter',
      type: 'REAL',
      role: 'input',
      value: 0,
    }];
    const tagStore = {
      list: () => tags,
      get: (id) => tags.find((t) => t.id === id),
      replaceAll: (next) => {
        tags.length = 0;
        tags.push(...next);
      },
    };
    syncNextcenturySemanticTags(tagStore, {
      nextCentury: {
        driverId: 'nextcentury1',
        semanticMap: [
          { tagId: 'MECH_METER_KWH', deviceId: '11F01BBC', field: 'totalUsage' },
          { tagId: 'MECH_METER_INTERVAL_KWH', deviceId: '11F01BBC', field: 'currentReading' },
        ],
      },
    });
    assert.equal(tags.length, 2);
    assert.equal(tags[0].driverAddress.deviceId, '11F01BBC');
    assert.equal(tags[0].driverAddress.field, 'totalUsage');
    const interval = tags.find((t) => t.id === 'MECH_METER_INTERVAL_KWH');
    assert.ok(interval);
    assert.equal(interval.driverAddress.field, 'currentReading');
  });

  it('mergedSemanticMap fills RM101 from defaults when stored map only has RM102', () => {
    const merged = mergedSemanticMap([
      { tagId: 'RM102_AC_PAN_LEAK', deviceId: 'FA003A90', field: 'leakActive' },
    ]);
    assert.ok(merged.some((e) => e.tagId === 'RM102_AC_PAN_LEAK'));
    assert.ok(merged.some((e) => e.tagId === 'RM101_AC_PAN_LEAK'));
    assert.ok(merged.some((e) => e.tagId === 'RM101_TOILET_LEAK'));
    assert.equal(merged.filter((e) => e.tagId === 'RM101_AC_PAN_LEAK').length, 1);
  });

  it('patchAssistedLivingHmi adds mechanical interval binding', () => {
    const hmi = {
      screens: [{ id: 'screen_6', name: 'Mechanical' }],
      bindings: [{
        screenId: 'screen_6',
        elementId: 't1_1_z0__val_total_kw',
        tagId: 'MECH_METER_KWH',
        property: 'text',
      }],
    };
    const patched = patchAssistedLivingHmi(hmi);
    assert.equal(patched.bindings.length, 2);
    assert.ok(patched.bindings.some((b) => b.tagId === 'MECH_METER_INTERVAL_KWH'));
  });
});

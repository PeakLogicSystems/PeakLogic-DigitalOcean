'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ALL_REGISTERS,
  DATA_REGISTERS,
  CONTROL_REGISTERS,
  buildEzMeterModbusTags,
} = require('../src/facilities/ezmeterRegisterMap');
const {
  buildEzMeterPqDerivedTags,
  defaultEzMeterSemanticMap,
  isEzMeterFacility,
  pqThresholds,
} = require('../src/facilities/ezmeterPq');
const { applySemanticMap } = require('../scripts/assisted-living/ezmeter-map');

describe('ezmeterRegisterMap', () => {
  it('maps all RGB v1.600 data and control registers', () => {
    assert.equal(DATA_REGISTERS.length, 28);
    assert.equal(CONTROL_REGISTERS.length, 22);
    assert.equal(ALL_REGISTERS.length, 50);
    const tags = buildEzMeterModbusTags('dds_rgb');
    assert.equal(tags.length, 50);
    assert.ok(tags.every((t) => t.driverAddress.table === 'holding'));
  });
});

describe('ezmeterPq', () => {
  it('builds facility PQ derived tags with alarm thresholds', () => {
    const tags = buildEzMeterPqDerivedTags({ nominalV: 277, undervoltV: 250 });
    assert.ok(tags.some((t) => t.id === 'MECH_PQ_ALM'));
    assert.ok(tags.some((t) => t.id === 'MECH_PQ_CFG_NOM_V' && t.value === 277));
    assert.ok(tags.some((t) => t.id === 'MECH_PQ_CFG_UV_V' && t.value === 250));
  });

  it('detects ezMeter facility driver mode', () => {
    assert.equal(isEzMeterFacility({ facility: { driver: 'ezmeter' } }), true);
    assert.equal(isEzMeterFacility({ ezMeter: { enabled: true } }), true);
    assert.equal(isEzMeterFacility({ facility: { driver: 'nextcentury' } }), false);
  });

  it('wires semantic map from DDS source tags', () => {
    const meterTags = buildEzMeterModbusTags('dds_rgb');
    const pq = buildEzMeterPqDerivedTags();
    const summary = [
      { id: 'MECH_METER_KWH', type: 'REAL', role: 'input', value: 0 },
    ];
    const wired = applySemanticMap([...meterTags, ...pq, ...summary], 'dds_rgb');
    const kwh = wired.find((t) => t.id === 'MECH_METER_KWH');
    const src = wired.find((t) => t.id === 'DDS_WH_SUM_IMP');
    assert.equal(kwh.driverId, 'dds_rgb');
    assert.deepEqual(kwh.driverAddress, src.driverAddress);
    assert.equal(kwh.scale, 0.001);
  });

  it('exposes default semantic map for campus meter + PQ mirrors', () => {
    const map = defaultEzMeterSemanticMap();
    assert.ok(map.some((m) => m.tagId === 'MECH_METER_KWH' && m.sourceTagId === 'DDS_WH_SUM_IMP'));
    assert.ok(map.some((m) => m.tagId === 'MECH_PQ_VA' && m.sourceTagId === 'DDS_V_A'));
    assert.equal(pqThresholds({}).nominalV, 120);
  });
});

describe('ezmeter derived measurement set preset', () => {
  const {
    buildEzMeterPqDerivedPreset,
    buildEzMeterPqDerivedApplyTags,
    applyTagsOnlyPreset,
    EZMETER_PQ_DERIVED_PRESET_ID,
  } = require('../src/devices/applyDerivedPreset');
  const { buildEzMeterModbusTags } = require('../src/facilities/ezmeterRegisterMap');
  const { listPresets } = require('../src/devices/devicePresets');

  it('lists derived preset in device presets', () => {
    const p = listPresets().find((x) => x.id === EZMETER_PQ_DERIVED_PRESET_ID);
    assert.ok(p);
    assert.equal(p.tagsOnly, true);
    assert.equal(p.defaultProgram, 'logic/ezmeter_facility_pq.st');
  });

  it('builds wired derived tags from existing DDS tags', () => {
    const meterTags = buildEzMeterModbusTags('dds_rgb');
    const added = buildEzMeterPqDerivedApplyTags(meterTags, { driverId: 'dds_rgb' });
    assert.ok(added.length >= 23);
    const kwh = added.find((t) => t.id === 'MECH_METER_KWH');
    const src = meterTags.find((t) => t.id === 'DDS_WH_SUM_IMP');
    assert.equal(kwh.driverId, 'dds_rgb');
    assert.deepEqual(kwh.driverAddress, src.driverAddress);
    assert.ok(added.some((t) => t.id === 'MECH_PQ_ALM'));
  });

  it('applyTagsOnlyPreset merges tags and patches settings', () => {
    const preset = buildEzMeterPqDerivedPreset();
    const meterTags = buildEzMeterModbusTags('dds_rgb');
    const tags = [];
    const store = {
      list: () => tags,
      replaceAll: (next) => { tags.length = 0; tags.push(...next); },
      count: () => tags.length,
    };
    const drivers = [{ id: 'dds_rgb', type: 'modbus_rtu', slaveId: 1 }];
    const files = {};
    const persistence = {
      readJson: (name) => ({ ...(files[name] || {}) }),
      writeJson: (name, data) => { files[name] = data; },
    };
    const result = applyTagsOnlyPreset({
      presetMeta: preset,
      tagList: meterTags,
      driverList: drivers,
      buildOpts: { driverId: 'dds_rgb' },
      replaceTags: false,
      tagStore: store,
      persistence,
    });
    assert.equal(result.ok, true);
    assert.ok(result.tagsAdded >= 23);
    assert.equal(files['settings.json'].activeProgram, 'logic/ezmeter_facility_pq.st');
    assert.equal(files['settings.json'].assistedLiving.ezMeter.enabled, true);
  });
});

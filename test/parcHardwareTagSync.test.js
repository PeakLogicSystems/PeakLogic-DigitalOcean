'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TagStore } = require('../src/tags/tagStore');
const {
  ensureParcHardwareTags,
  applyParcHardwareTelemetry,
  dedupeParcTags,
  buildParcTagSnap,
} = require('../src/parc/parcTagSync');
const { MqttCentralHub, defaultCentralSettings } = require('../src/parc/mqttCentralHub');
const { encodeGlobalMqttPayload } = require('../src/parc/globalMqttPayload');
const { mirrorDuplexFloatLevels } = require('../src/parc/duplexFloatMirror');

describe('parcHardwareTagSync', () => {
  it('dedupeParcTags prefers input role over memory for the same id', () => {
    const rows = dedupeParcTags([
      { id: 'X1_I2', type: 'BOOL', role: 'input', value: true },
      { id: 'X1_I2', type: 'BOOL', role: 'memory', value: false },
      { id: 'X1_I4', type: 'BOOL', role: 'memory', value: false },
      { id: 'X1_I4', type: 'BOOL', role: 'input', value: true },
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    assert.equal(byId.get('X1_I2').role, 'input');
    assert.equal(byId.get('X1_I2').value, true);
    assert.equal(byId.get('X1_I4').role, 'input');
    assert.equal(byId.get('X1_I4').value, true);
  });

  it('buildParcTagSnap keeps hardware input values for mirror', () => {
    const snap = buildParcTagSnap([
      { id: 'X1_I2', type: 'BOOL', role: 'input', value: true },
      { id: 'X1_I2', type: 'BOOL', role: 'memory', value: false },
      { id: 'X1_I4', type: 'BOOL', role: 'memory', value: false },
      { id: 'X1_I4', type: 'BOOL', role: 'input', value: true },
    ]);
    assert.equal(snap.get('X1_I2').value, true);
    assert.equal(snap.get('X1_I4').value, true);
  });

  it('auto-adds analog/raw inputs from Parc telemetry', () => {
    const store = new TagStore();
    store.upsert({ id: 'X1_I2', type: 'BOOL', role: 'input', value: true });
    const added = ensureParcHardwareTags(store, [
      { id: 'I1_RAW', type: 'INT', role: 'input', value: 512 },
      { id: 'X2_AI1', type: 'REAL', role: 'input', value: 4.2 },
      { id: 'MOTOR1_RUN', type: 'BOOL', role: 'memory', value: false },
    ]);
    assert.equal(added, 2);
    assert.equal(store.get('I1_RAW').type, 'INT');
    assert.equal(store.get('I1_RAW').role, 'input');
    assert.equal(store.get('X2_AI1').type, 'REAL');
  });

  it('applyParcHardwareTelemetry updates values on existing rows', () => {
    const store = new TagStore();
    store.upsert({ id: 'I2_RAW', type: 'INT', role: 'input', value: 0 });
    applyParcHardwareTelemetry(store, [
      { id: 'I2_RAW', type: 'INT', role: 'input', value: 7037 },
    ]);
    assert.equal(store.get('I2_RAW').value, 7037);
  });
});

describe('mqttCentralHub duplex float ladder', () => {
  it('ignores global LVL_* MQTT and derives from X1_I* instead', () => {
    const store = new TagStore();
    for (const id of ['X1_I1', 'X1_I2', 'X1_I3', 'X1_I4']) {
      store.upsert({ id, type: 'BOOL', role: 'input', value: false, quality: 'GOOD' });
    }
    for (const id of ['LVL_HIGH', 'LVL_LEAD', 'LVL_LAG', 'LVL_OFF']) {
      store.upsert({ id, type: 'BOOL', role: 'memory', value: false });
    }
    store.setValue('X1_I2', true);

    const hub = new MqttCentralHub({ registry: { ingestReport() { return { ok: true }; } } });
    hub.cfg = {
      ...defaultCentralSettings(),
      enabled: true,
      globalSiteKey: 1,
      topicPrefix: 'peaklogic/v1',
    };
    hub.setGlobalMirrorDeps({ tagStore: store });

    hub._mirrorGlobalTag(
      'peaklogic/v1/g/0001/LVL_LAG',
      encodeGlobalMqttPayload('BOOL', true),
    );
    mirrorDuplexFloatLevels(store);

    assert.equal(store.get('LVL_LEAD').value, true);
    assert.equal(store.get('LVL_LAG').value, false);
  });
});

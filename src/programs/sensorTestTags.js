'use strict';

const fs = require('fs');
const path = require('path');
const { ST_DIR } = require('../config');
const { applyDefaultLabel } = require('../tags/tagLabels');

const FIXTURE_PATH = path.join(ST_DIR, 'fixtures', 'tags.opta_sensor_test.json');

function loadSensorTestDefs() {
  if (!fs.existsSync(FIXTURE_PATH)) return [];
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

function isSensorTestProgramPath(rel) {
  return String(rel || '').replace(/\\/g, '/') === 'opta/09_moisture_ntc_ct.st';
}

function coerceRepairedValue(def, existing) {
  if (!existing || existing.type === def.type) {
    const n = Number(existing?.value);
    if (def.type === 'BOOL') return !!existing?.value;
    if (def.type === 'REAL' && Number.isFinite(n)) return n;
    if (def.type === 'INT' && Number.isFinite(n)) return Math.trunc(n);
    return def.value ?? (def.type === 'BOOL' ? false : 0);
  }
  if (existing.type === 'BOOL') return def.value ?? (def.type === 'BOOL' ? false : 0);
  const n = Number(existing.value);
  if (def.type === 'INT' && Number.isFinite(n)) return Math.trunc(n);
  if (def.type === 'REAL' && Number.isFinite(n)) return n;
  return def.value ?? (def.type === 'BOOL' ? false : 0);
}

/** Fix sensor-test tags saved with wrong type (BOOL) so SetInt / °F display work. */
function repairSensorTestTags(tagStore) {
  const defs = loadSensorTestDefs();
  if (!defs.length) return [];
  const repaired = [];
  for (const def of defs) {
    const existing = tagStore.get(def.id);
    if (!existing) continue;
    const typeWrong = def.type && existing.type !== def.type;
    const calWrong = def.id === 'I2_RAW' && (
      existing.linearize !== def.linearize
      || existing.engUnit !== def.engUnit
      || Number(existing.adcMax) !== Number(def.adcMax)
      || Number(existing.scale) !== Number(def.scale)
      || Number(existing.offset) !== Number(def.offset)
    );
    if (!typeWrong && !calWrong) continue;
    tagStore.upsert(applyDefaultLabel({
      ...existing,
      ...def,
      type: def.type,
      value: coerceRepairedValue(def, existing),
      graphEnabled: def.graphEnabled != null ? def.graphEnabled : existing.graphEnabled,
    }));
    repaired.push(def.id);
  }
  return repaired;
}

module.exports = {
  loadSensorTestDefs,
  isSensorTestProgramPath,
  repairSensorTestTags,
};

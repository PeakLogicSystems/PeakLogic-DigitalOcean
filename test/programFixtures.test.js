'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadFixtureBundle, resolveProgramTags } = require('../src/programs/programFixtures');
const fs = require('fs');
const path = require('path');

describe('programFixtures', () => {
  it('loads only tags referenced by opta/01_i1_to_r1.st', () => {
    const mqttDrivers = [{ id: 'opta_mqtt_st', type: 'mqtt_fleet', enabled: true }];
    const bundle = loadFixtureBundle('opta/01_i1_to_r1.st', mqttDrivers);
    assert.ok(bundle);
    assert.deepEqual(bundle.tags.map((t) => t.id).sort(), ['I1', 'R1']);
    assert.equal(bundle.tags.every((t) => t.driverId === 'opta_mqtt_st'), true);
  });

  it('loads all memory tags for opta/03_pid_avg.st', () => {
    const mqttDrivers = [{ id: 'opta_mqtt_st', type: 'mqtt_fleet', enabled: true }];
    const bundle = loadFixtureBundle('opta/03_pid_avg.st', mqttDrivers);
    assert.ok(bundle);
    const ids = bundle.tags.map((t) => t.id).sort();
    assert.ok(ids.includes('H2'));
    assert.ok(ids.includes('H3'));
    assert.ok(ids.includes('PID1'));
    assert.ok(ids.includes('AVG1'));
    assert.equal(ids.length, 9);
  });

  it('maps logic/21_all_st_features_memory.st to tags.all_st_features.json', () => {
    const bundle = loadFixtureBundle('logic/21_all_st_features_memory.st', []);
    assert.ok(bundle);
    assert.equal(bundle.tagsFile, 'tags.all_st_features.json');
    assert.ok(bundle.tags.some((t) => t.id === 'VPB30'));
    assert.ok(bundle.tags.some((t) => t.id === 'PID30'));
  });

  it('infers missing tags from program refs', () => {
    const base = [{ id: 'I1', type: 'BOOL', role: 'input', value: false, driverId: 'opta_mqtt_st' }];
    const tags = resolveProgramTags('opta/01_i1_to_r1.st', base, [
      { id: 'opta_mqtt_st', type: 'mqtt_fleet', enabled: true },
    ]);
    assert.deepEqual(tags.map((t) => t.id).sort(), ['I1', 'R1']);
    const r1 = tags.find((t) => t.id === 'R1');
    assert.equal(r1.type, 'BOOL');
    assert.equal(r1.role, 'output');
  });
});

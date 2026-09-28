'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { TagStore } = require('../src/tags/tagStore');
const { parseProgram } = require('../src/engine/parser');
const { execute, createContext } = require('../src/engine/executor');
const { loadFixtureBundle } = require('../src/programs/programFixtures');
const { ensureTpoTags, repairTpoIntTags } = require('../src/programs/tpoTags');
const { ST_DIR } = require('../src/config');

function runTpoScans(store, ast, count) {
  for (let i = 0; i < count; i += 1) {
    execute(ast, createContext(store));
  }
}

describe('tpo_irrigation cycle', () => {
  it('applies for 30 minutes then waits 120 minutes (24 hour mode)', () => {
    const bundle = loadFixtureBundle('logic/23_tpo_irrigation.st', []);
    const store = new TagStore();
    store.replaceAll(bundle.tags);
    store.get('TPO1_EN').value = true;
    store.get('TPO1_24HR').value = true;
    store.get('TPO1_ON_MIN').value = 30;
    store.get('TPO1_OFF_MIN').value = 120;
    store.get('TPO1_TOD_STEP').value = 1;

    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '23_tpo_irrigation.st'), 'utf8');
    const { ast, errors } = parseProgram(src);
    assert.equal(errors.length, 0, errors.join('; '));

    runTpoScans(store, ast, 1);
    assert.equal(store.get('TPO1_OUT').value, true);
    assert.equal(store.get('TPO1_STA').value, 2);
    assert.equal(store.get('TPO1_PULSE_REM').value, 30);

    runTpoScans(store, ast, 29);
    assert.equal(store.get('TPO1_OUT').value, true);
    assert.equal(store.get('TPO1_PULSE_REM').value, 1);

    runTpoScans(store, ast, 1);
    assert.equal(store.get('TPO1_OUT').value, true);
    assert.equal(store.get('TPO1_PULSE_REM').value, 0);

    runTpoScans(store, ast, 1);
    assert.equal(store.get('TPO1_OUT').value, false);
    assert.equal(store.get('TPO1_GAP').value, true);
    assert.equal(store.get('TPO1_STA').value, 3);
    assert.equal(store.get('TPO1_PULSE_REM').value, 120);

    runTpoScans(store, ast, 119);
    assert.equal(store.get('TPO1_OUT').value, false);
    assert.equal(store.get('TPO1_GAP').value, true);
    assert.equal(store.get('TPO1_PULSE_REM').value, 1);

    runTpoScans(store, ast, 1);
    assert.equal(store.get('TPO1_PULSE_REM').value, 0);

    runTpoScans(store, ast, 1);
    assert.equal(store.get('TPO1_OUT').value, true);
    assert.equal(store.get('TPO1_GAP').value, false);
    assert.equal(store.get('TPO1_STA').value, 2);
    assert.equal(store.get('TPO1_PULSE_REM').value, 30);
  });

  it('offline latch stops output and sets status offline', () => {
    const bundle = loadFixtureBundle('logic/23_tpo_irrigation.st', []);
    const store = new TagStore();
    store.replaceAll(bundle.tags);
    repairTpoIntTags(store);
    store.get('TPO1_EN').value = true;
    store.get('TPO1_24HR').value = true;
    store.get('TPO1_ON_MIN').value = 30;
    store.get('TPO1_OFF_MIN').value = 120;
    store.get('TPO1_TOD_STEP').value = 1;
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '23_tpo_irrigation.st'), 'utf8');
    const { ast, errors } = parseProgram(src);
    assert.equal(errors.length, 0);
    runTpoScans(store, ast, 1);
    assert.equal(store.get('TPO1_OUT').value, true);
    store.get('TPO1_OFFLINE').value = true;
    runTpoScans(store, ast, 1);
    assert.equal(store.get('TPO1_OUT').value, false);
    assert.equal(store.get('TPO1_STA').value, 1);
  });
});

describe('repairTpoIntTags', () => {
  it('repairs BOOL minute tags so SetInt and HMI edits work', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'TPO1_ON_MIN', type: 'BOOL', role: 'memory', value: false },
      { id: 'TPO1_OFF_MIN', type: 'BOOL', role: 'memory', value: false },
      { id: 'TPO1_PULSE_REM', type: 'BOOL', role: 'memory', value: false },
    ]);
    const repaired = repairTpoIntTags(store);
    assert.deepEqual(repaired.sort(), ['TPO1_OFF_MIN', 'TPO1_ON_MIN', 'TPO1_PULSE_REM']);
    assert.equal(store.get('TPO1_ON_MIN').type, 'INT');
    assert.equal(store.get('TPO1_ON_MIN').value, 30);
    assert.equal(store.get('TPO1_OFF_MIN').type, 'INT');
    assert.equal(store.get('TPO1_OFF_MIN').value, 120);
    ensureTpoTags(store);
    assert.equal(store.get('TPO1_24HR').value, true);
  });
});

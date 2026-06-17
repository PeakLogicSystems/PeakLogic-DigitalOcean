'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseProgram, validateProgram } = require('../src/engine/parser');
const { ST_DIR } = require('../src/config');

const FIXTURES = path.join(ST_DIR, 'fixtures');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function listStFiles(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(...listStFiles(full, rel));
    else if (name.endsWith('.st')) out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

const TAGS_BY_CATEGORY = {
  logic: () => loadJson('tags.logic.json').map((t) => t.id),
  mqtt: () => loadJson('tags.mqtt.json').map((t) => t.id),
  modbus: () => loadJson('tags.modbus.json').map((t) => t.id),
  opta: () => loadJson('tags.opta.json').map((t) => t.id),
  opta_eth: () => loadJson('tags.opta_eth.json').map((t) => t.id),
  root: () => loadJson('tags.logic.json').map((t) => t.id),
};

const TAGS_BY_FILE = {
  'logic/08_waveshare_di1_q1.st': () => loadJson('tags.waveshare_rtu_8ch.json').map((t) => t.id),
  'logic/21_all_st_features_memory.st': () => loadJson('tags.all_st_features.json').map((t) => t.id),
  'opta/01_i1_to_r1.st': () => loadJson('tags.opta_eth.json').map((t) => t.id),
  'opta/02_analog_alarm_to_r2.st': () => loadJson('tags.opta_eth.json').map((t) => t.id),
  'opta/03_pid_avg.st': () => loadJson('tags.opta_eth.json').map((t) => t.id),
  'modbus/08_waveshare_di1_q1.st': () => loadJson('tags.waveshare_rtu_8ch.json').map((t) => t.id),
};

describe('st test programs', () => {
  it('lists programs under st/', () => {
    const files = listStFiles(ST_DIR);
    assert.ok(files.some((f) => f.startsWith('logic/')));
    assert.ok(files.some((f) => f.startsWith('mqtt/')));
    assert.ok(files.some((f) => f.startsWith('modbus/')));
    assert.ok(files.some((f) => f.startsWith('opta/')));
  });

  const SKIP_VALIDATE = new Set(['program.st', 'logic/17_waveshare_di1_q1.st']);
  for (const rel of listStFiles(ST_DIR).filter((f) => !SKIP_VALIDATE.has(f))) {
    const category = rel.includes('/') ? rel.split('/')[0] : 'root';
    if (!TAGS_BY_CATEGORY[category]) continue;
    it(`validates ${rel}`, () => {
      const src = fs.readFileSync(path.join(ST_DIR, rel), 'utf8');
      const { ast } = parseProgram(src);
      const tagIds = TAGS_BY_FILE[rel] ? TAGS_BY_FILE[rel]() : TAGS_BY_CATEGORY[category]();
      const errors = validateProgram(ast, tagIds);
      assert.deepEqual(errors, [], errors.join('; '));
    });
  }
});

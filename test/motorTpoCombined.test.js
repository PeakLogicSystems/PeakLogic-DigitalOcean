'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { loadFixtureBundle } = require('../src/programs/programFixtures');
const { parseProgram, validateProgram } = require('../src/engine/parser');

describe('motor_tpo_combined fixture', () => {
  it('loads merged tags for combined program', () => {
    const bundle = loadFixtureBundle('logic/24_motor_tpo_combined.st', []);
    assert.ok(bundle);
    const ids = bundle.tags.map((t) => t.id);
    assert.ok(ids.includes('MOTOR1_RUN'));
    assert.ok(ids.includes('TPO1_ON_MIN'));
    assert.ok(ids.includes('TPO1_OFF_MIN'));
    assert.ok(ids.includes('TPO1_24HR'));
    assert.equal(ids.length, 23);
  });

  it('validates combined ST program', () => {
    const fs = require('fs');
    const path = require('path');
    const { ST_DIR } = require('../src/config');
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '24_motor_tpo_combined.st'), 'utf8');
    const { ast } = parseProgram(src);
    const bundle = loadFixtureBundle('logic/24_motor_tpo_combined.st', []);
    const errors = validateProgram(ast, bundle.tags.map((t) => t.id));
    assert.equal(errors.length, 0, errors.join('; '));
  });
});

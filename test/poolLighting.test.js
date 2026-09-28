'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFixtureBundle } = require('../src/programs/programFixtures');
const { parseProgram, validateProgram } = require('../src/engine/parser');
const { ST_DIR } = require('../src/config');

describe('pool_lighting fixture', () => {
  it('loads lighting tags for standalone program', () => {
    const bundle = loadFixtureBundle('logic/31_pool_lighting.st', []);
    assert.ok(bundle);
    const ids = bundle.tags.map((t) => t.id);
    assert.ok(ids.includes('LIGHT_Z1'));
    assert.ok(ids.includes('LIGHT_COLOR_Z3'));
    assert.ok(ids.includes('TMR_LZ4_OFF'));
    assert.ok(ids.includes('POOL_BW_BUSY'));
    assert.equal(bundle.tagsFile, 'tags.pool_lighting.json');
  });

  it('validates pool lighting ST program', () => {
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '31_pool_lighting.st'), 'utf8');
    const { ast } = parseProgram(src);
    const bundle = loadFixtureBundle('logic/31_pool_lighting.st', []);
    const errors = validateProgram(ast, bundle.tags.map((t) => t.id));
    assert.equal(errors.length, 0, errors.join('; '));
  });

  it('validates merged pool controller includes lighting tags', () => {
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '30_pool_controller.st'), 'utf8');
    const { ast } = parseProgram(src);
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', []);
    const ids = bundle.tags.map((t) => t.id);
    assert.ok(ids.includes('LIGHT_OP'));
    assert.ok(ids.includes('LIGHT_Z6'));
    const errors = validateProgram(ast, ids);
    assert.equal(errors.length, 0, errors.join('; '));
  });
});

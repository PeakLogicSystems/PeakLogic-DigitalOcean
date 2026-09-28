'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseProgram } = require('../src/engine/parser');
const { createContext, execute } = require('../src/engine/executor');
const { TagStore } = require('../src/tags/tagStore');

function runSimplex(inputs = {}) {
  const src = fs.readFileSync(
    path.join(__dirname, '../st/logic/35_lift_simplex.st'),
    'utf8',
  );
  const { ast, errors } = parseProgram(src);
  assert.equal(errors.length, 0);
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../st/fixtures/tags.lift_simplex.json'), 'utf8'),
  );
  for (const [id, value] of Object.entries(inputs)) {
    const row = fixture.find((t) => t.id === id);
    if (row) row.value = value;
  }
  const store = new TagStore();
  store.replaceAll(fixture);
  const ctx = createContext(store, new Set());
  execute(ast, ctx, []);
  return store.list();
}

function tagBool(tags, id) {
  return !!tags.find((t) => t.id === id)?.value;
}

describe('35_lift_simplex.st', () => {
  it('drives R4 from ALT_FAULT on pump fail', () => {
    const tags = runSimplex({ PUMP_FAIL: true, PUMP_AUTO: true });
    assert.equal(tagBool(tags, 'ALT_FAULT'), true);
    assert.equal(tagBool(tags, 'R4'), true);
  });

  it('drives R4 from ALT_FAULT on high level alarm', () => {
    const tags = runSimplex({ LVL_HIGH: true, PUMP_AUTO: true });
    assert.equal(tagBool(tags, 'ALT_FAULT'), true);
    assert.equal(tagBool(tags, 'R4'), true);
  });

  it('clears R4 when healthy', () => {
    const tags = runSimplex({ PUMP_AUTO: true });
    assert.equal(tagBool(tags, 'ALT_FAULT'), false);
    assert.equal(tagBool(tags, 'R4'), false);
  });
});

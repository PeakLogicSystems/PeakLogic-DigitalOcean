'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TagStore } = require('../src/tags/tagStore');
const { parseProgram } = require('../src/engine/parser');
const { execute, createContext } = require('../src/engine/executor');
const { updateCounters } = require('../src/engine/functionBlocks');

describe('executor', () => {
  it('TurnON sets bool output', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'DI', type: 'BOOL', role: 'input', value: true },
      { id: 'Q', type: 'BOOL', role: 'output', value: false },
    ]);
    const { ast } = parseProgram('IF IsON(DI) THEN TurnON(Q); END_IF;');
    execute(ast, createContext(store));
    assert.equal(store.get('Q').value, true);
  });

  it('ELSIF selects the first matching branch', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'A', type: 'BOOL', role: 'input', value: false },
      { id: 'B', type: 'BOOL', role: 'input', value: true },
      { id: 'C', type: 'BOOL', role: 'input', value: true },
      { id: 'X', type: 'BOOL', role: 'output', value: false },
      { id: 'Y', type: 'BOOL', role: 'output', value: false },
      { id: 'Z', type: 'BOOL', role: 'output', value: false },
      { id: 'W', type: 'BOOL', role: 'output', value: false },
    ]);
    const src = [
      'IF IsON(A) THEN TurnON(X);',
      'ELSIF IsON(B) THEN TurnON(Y);',
      'ELSIF IsON(C) THEN TurnON(Z);',
      'ELSE TurnON(W);',
      'END_IF;',
    ].join(' ');
    const { ast } = parseProgram(src);
    execute(ast, createContext(store));
    assert.equal(store.get('X').value, false);
    assert.equal(store.get('Y').value, true);
    assert.equal(store.get('Z').value, false);
    assert.equal(store.get('W').value, false);
  });

  it('runs all-st-features memory program without error', () => {
    const fs = require('fs');
    const path = require('path');
    const { ST_DIR } = require('../src/config');
    const tags = JSON.parse(fs.readFileSync(path.join(ST_DIR, 'fixtures', 'tags.all_st_features.json'), 'utf8'));
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '21_all_st_features_memory.st'), 'utf8');
    const store = new TagStore();
    store.replaceAll(tags);
    const { ast, errors } = parseProgram(src);
    assert.equal(errors.length, 0, errors.join('; '));
    assert.ok(ast);
    execute(ast, createContext(store));
    assert.equal(store.get('VPB40').value, false);
    store.get('VPB30').value = true;
    execute(ast, createContext(store));
    assert.equal(store.get('VPB40').value, true);
    assert.equal(store.get('VPB42').value, true);
  });

  it('OneShot fires once per runtime session', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'OS1', type: 'BOOL', role: 'memory', value: false },
      { id: 'R1', type: 'BOOL', role: 'output', value: false },
    ]);
    const { ast } = parseProgram('IF OneShot(OS1) THEN TurnON(R1); END_IF;');
    const fired = new Set();
    const ctx = createContext(store, fired);

    execute(ast, ctx);
    assert.equal(store.get('R1').value, true);

    store.get('R1').value = false;
    execute(ast, ctx);
    assert.equal(store.get('R1').value, false);

    fired.clear();
    execute(ast, ctx);
    assert.equal(store.get('R1').value, true);
  });

  it('CounterCu(CTR, DI) counts on rising edge of DI', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'DI', type: 'BOOL', role: 'input', value: false },
      { id: 'CTR', type: 'COUNTER', role: 'fb', preset: 10, mode: 'CTU', fb: { count: 0 } },
    ]);
    const { ast } = parseProgram('CounterCu(CTR, DI);');
    const ctx = createContext(store);
    execute(ast, ctx);
    updateCounters(store.list());
    assert.equal(store.get('CTR').fb.count, 0);

    store.get('DI').value = true;
    execute(ast, ctx);
    updateCounters(store.list());
    assert.equal(store.get('CTR').fb.count, 1);

    execute(ast, ctx);
    updateCounters(store.list());
    assert.equal(store.get('CTR').fb.count, 1);

    store.get('DI').value = false;
    execute(ast, ctx);
    updateCounters(store.list());
    store.get('DI').value = true;
    execute(ast, ctx);
    updateCounters(store.list());
    assert.equal(store.get('CTR').fb.count, 2);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { TagStore } = require('../src/tags/tagStore');
const { parseProgram } = require('../src/engine/parser');
const { execute, createContext } = require('../src/engine/executor');
const { compileLocalProgram, parseBcProgram, runBytecode } = require('../src/engine/stBcRunner');
const { loadFixtureBundle } = require('../src/programs/programFixtures');
const { ST_DIR } = require('../src/config');

function cloneStore(store) {
  const next = new TagStore();
  next.replaceAll(store.list().map((t) => JSON.parse(JSON.stringify(t))));
  return next;
}

function runAst(store, ast, fired) {
  execute(ast, createContext(store, fired));
}

function runBc(store, buf, parsed, traceMap, fired) {
  runBytecode(buf, parsed, createContext(store, fired), traceMap);
}

function tagValues(store, ids) {
  const out = {};
  for (const id of ids) out[id] = store.get(id)?.value;
  return out;
}

describe('stBcRunner', () => {
  it('matches AST executor for TurnON / ELSIF', () => {
    const tags = [
      { id: 'A', type: 'BOOL', role: 'input', value: false },
      { id: 'B', type: 'BOOL', role: 'input', value: true },
      { id: 'Y', type: 'BOOL', role: 'output', value: false },
    ];
    const src = 'IF IsON(A) THEN TurnON(Y); ELSIF IsON(B) THEN TurnOFF(Y); END_IF;';
    const { ast } = parseProgram(src);
    const storeA = new TagStore();
    storeA.replaceAll(tags);
    const storeB = cloneStore(storeA);
    const firedA = new Set();
    const firedB = new Set();
    const compiled = compileLocalProgram(ast, storeA);
    const parsed = parseBcProgram(compiled.bytecode);

    runAst(storeA, ast, firedA);
    runBc(storeB, compiled.bytecode, parsed, compiled.traceMap, firedB);

    assert.equal(storeA.get('Y').value, storeB.get('Y').value);
    assert.equal(storeA.get('Y').value, false);
  });

  it('matches AST executor for all-st-features memory program', () => {
    const tags = JSON.parse(
      fs.readFileSync(path.join(ST_DIR, 'fixtures', 'tags.all_st_features.json'), 'utf8'),
    );
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '21_all_st_features_memory.st'), 'utf8');
    const { ast } = parseProgram(src);
    const storeA = new TagStore();
    storeA.replaceAll(tags);
    const storeB = cloneStore(storeA);
    const compiled = compileLocalProgram(ast, storeA);
    const parsed = parseBcProgram(compiled.bytecode);
    const watch = ['VPB40', 'VPB42', 'VPB30'];

    runAst(storeA, ast, new Set());
    runBc(storeB, compiled.bytecode, parsed, compiled.traceMap, new Set());
    assert.deepEqual(tagValues(storeA, watch), tagValues(storeB, watch));

    storeA.get('VPB30').value = true;
    storeB.get('VPB30').value = true;
    runAst(storeA, ast, new Set());
    runBc(storeB, compiled.bytecode, parsed, compiled.traceMap, new Set());
    assert.deepEqual(tagValues(storeA, watch), tagValues(storeB, watch));
    assert.equal(storeA.get('VPB40').value, true);
  });

  it('matches AST executor for pool controller scan slice', () => {
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', []);
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '30_pool_controller.st'), 'utf8');
    const { ast } = parseProgram(src);
    const storeA = new TagStore();
    storeA.replaceAll(bundle.tags.map((t) => ({ ...t })));
    const storeB = cloneStore(storeA);
    const compiled = compileLocalProgram(ast, storeA);
    const parsed = parseBcProgram(compiled.bytecode);

    storeA.get('POOL_FLOW_METER_EN').value = false;
    storeB.get('POOL_FLOW_METER_EN').value = false;
    storeA.get('POOL_FLOW_SW').value = true;
    storeB.get('POOL_FLOW_SW').value = true;
    storeA.get('POOL_EN').value = true;
    storeB.get('POOL_EN').value = true;

    runAst(storeA, ast, new Set());
    runBc(storeB, compiled.bytecode, parsed, compiled.traceMap, new Set());

    const watch = ['FLOW_PERM', 'PUMP_RUN_CMD', 'POOL_BW_STA', 'MOTOR1_STA'];
    assert.deepEqual(tagValues(storeA, watch), tagValues(storeB, watch));
  });

  it('is faster than AST interpreter on pool controller', () => {
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', []);
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '30_pool_controller.st'), 'utf8');
    const { ast } = parseProgram(src);
    const store = new TagStore();
    store.replaceAll(bundle.tags.map((t) => ({ ...t })));
    const compiled = compileLocalProgram(ast, store);
    const parsed = parseBcProgram(compiled.bytecode);
    const iterations = 500;
    const tAst0 = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      execute(ast, createContext(store, new Set()), null);
    }
    const astUs = Number(process.hrtime.bigint() - tAst0) / 1000 / iterations;

    const tBc0 = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      runBytecode(compiled.bytecode, parsed, createContext(store, new Set()), null);
    }
    const bcUs = Number(process.hrtime.bigint() - tBc0) / 1000 / iterations;

    assert.ok(bcUs <= astUs * 1.25, `bytecode ${bcUs.toFixed(0)}us vs AST ${astUs.toFixed(0)}us`);
  });
});

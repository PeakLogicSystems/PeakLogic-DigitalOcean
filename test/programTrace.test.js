'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TagStore } = require('../src/tags/tagStore');
const { parseProgram } = require('../src/engine/parser');
const { execute, createContext, collectExpressionTrace } = require('../src/engine/executor');

describe('program expression trace', () => {
  it('records spans and bool results for IF conditions', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'DI', type: 'BOOL', role: 'input', value: true },
      { id: 'Q', type: 'BOOL', role: 'output', value: false },
    ]);
    const src = 'IF IsON(DI) THEN TurnON(Q); END_IF;';
    const { ast } = parseProgram(src);
    const trace = [];
    execute(ast, createContext(store), trace);
    assert.ok(trace.some((t) => t.kind === 'bool' && t.value === true));
    assert.ok(trace.every((t) => t.end > t.start));
    const isOn = trace.find((t) => t.kind === 'bool' && t.end - t.start > 3);
    assert.ok(isOn);
    assert.equal(src.slice(isOn.start, isOn.end), 'IsON(DI)');
  });

  it('records numeric results for arithmetic', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'AI1', type: 'INT', role: 'input', value: 10 },
      { id: 'R1', type: 'BOOL', role: 'memory', value: false },
    ]);
    const src = 'IF AI1 + 5 > 12 THEN TurnON(R1); END_IF;';
    const { ast } = parseProgram(src);
    const trace = collectExpressionTrace(ast, createContext(store));
    const sum = trace.find((t) => t.kind === 'num' && t.value === 15);
    assert.ok(sum);
    assert.ok(trace.some((t) => t.kind === 'bool' && t.value === true));
  });

  it('highlights output tags red when ON', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'DI', type: 'BOOL', role: 'input', value: true },
      { id: 'R1', type: 'BOOL', role: 'output', value: false },
    ]);
    const src = 'IF IsON(DI) THEN TurnON(R1); END_IF;';
    const { ast } = parseProgram(src);
    const trace = [];
    execute(ast, createContext(store), trace);
    assert.equal(store.get('R1').value, true);
    const out = trace.find((t) => t.kind === 'out' && t.tag === 'R1');
    assert.ok(out);
    assert.equal(out.value, true);
    assert.equal(src.slice(out.start, out.end), 'R1');
  });

  it('collectExpressionTrace does not run actions', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'DI', type: 'BOOL', role: 'input', value: true },
      { id: 'Q', type: 'BOOL', role: 'output', value: false },
    ]);
    const { ast } = parseProgram('IF IsON(DI) THEN TurnON(Q); END_IF;');
    collectExpressionTrace(ast, createContext(store));
    assert.equal(store.get('Q').value, false);
  });
});

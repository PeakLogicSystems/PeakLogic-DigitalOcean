'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TagStore } = require('../src/tags/tagStore');
const { parseProgram } = require('../src/engine/parser');
const { execute, createContext } = require('../src/engine/executor');

describe('writeHmiMemory', () => {
  it('writes BOOL memory tags without setting force flags', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'MOTOR1_START', type: 'BOOL', role: 'memory', value: false },
    ]);
    const tag = store.writeHmiMemory('MOTOR1_START', true);
    assert.equal(tag.value, true);
    assert.equal(tag.forceOutput, false);
    assert.equal(tag.forceInput, false);
    assert.equal(tag.forceValue, undefined);
  });

  it('clears existing force so ST can update the tag', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'MOTOR1_START', type: 'BOOL', role: 'memory', value: false },
      { id: 'MOTOR1_RUN', type: 'BOOL', role: 'output', value: false },
    ]);
    store.setForce('MOTOR1_START', { forceOutput: true, forceValue: true });
    assert.equal(store.get('MOTOR1_START').forceOutput, true);

    store.writeHmiMemory('MOTOR1_START', false);
    const t = store.get('MOTOR1_START');
    assert.equal(t.value, false);
    assert.equal(t.forceOutput, false);

    const { ast } = parseProgram('IF IsON(MOTOR1_START) THEN TurnON(MOTOR1_RUN); END_IF;');
    store.get('MOTOR1_START').value = true;
    execute(ast, createContext(store));
    assert.equal(store.get('MOTOR1_RUN').value, true);
  });

  it('rejects non-memory tags', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'DO1', type: 'BOOL', role: 'output', value: false },
    ]);
    assert.throws(
      () => store.writeHmiMemory('DO1', true),
      (e) => e.status === 400,
    );
  });

  it('writes INT HOA values', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'MOTOR1_HOA', type: 'INT', role: 'memory', value: 0 },
    ]);
    store.writeHmiMemory('MOTOR1_HOA', 2);
    assert.equal(store.get('MOTOR1_HOA').value, 2);
  });
});

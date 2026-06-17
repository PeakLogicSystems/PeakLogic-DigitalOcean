'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  modbusRegSpan,
  arrayToRegisterWords,
  registersToArray,
  getArrayElement,
  setArrayElement,
} = require('../src/tags/tagArrays');
const { parseProgram, validateProgram } = require('../src/engine/parser');
const { createContext } = require('../src/engine/executor');
const { TagStore } = require('../src/tags/tagStore');

describe('tagArrays modbus', () => {
  it('computes register span for 32-bit array', () => {
    const tag = { type: 'INT', arrayLen: 5, wordWidth: 32 };
    assert.strictEqual(modbusRegSpan(tag), 10);
  });

  it('round-trips 32-bit array to register words', () => {
    const tag = { type: 'INT', arrayLen: 3, wordWidth: 32, signed: true };
    const words = arrayToRegisterWords(tag, [100, -1, 0x7fffffff]);
    assert.strictEqual(words.length, 6);
    const back = registersToArray(tag, words, (raw) => raw);
    assert.deepStrictEqual(back, [100, -1, 0x7fffffff]);
  });
});

describe('ST array syntax', () => {
  it('parses subscript and SetArray', () => {
    const { ast, errors } = parseProgram(`
      IF HR_BLK[2] > 10 THEN
        SetArray(HR_BLK, 2, 99);
      END_IF;
    `);
    assert.strictEqual(errors.length, 0);
    assert.ok(ast);
  });

  it('executes SetArray on array tag', () => {
    const store = new TagStore();
    store.replaceAll([{
      id: 'HR_BLK',
      type: 'INT',
      role: 'input',
      driverId: 'mb1',
      wordWidth: 32,
      arrayLen: 4,
      value: [0, 0, 0, 0],
    }]);
    const { ast } = parseProgram('SetArray(HR_BLK, 1, 42);');
    const ctx = createContext(store);
    const { execute } = require('../src/engine/executor');
    execute(ast, ctx);
    assert.strictEqual(getArrayElement(store.get('HR_BLK'), 1), 42);
  });

  it('validates array tag refs', () => {
    const { ast } = parseProgram('IF ARR[0] = 1 THEN TurnON(Q1); END_IF;');
    const errs = validateProgram(ast, ['ARR', 'Q1']);
    assert.strictEqual(errs.length, 0);
  });
});

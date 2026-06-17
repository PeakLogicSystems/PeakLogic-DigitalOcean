'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseProgram } = require('../src/engine/parser');
const { astToJson } = require('../src/engine/astJson');

describe('astJson', () => {
  it('serializes IF/THEN program to JSON', () => {
    const { ast } = parseProgram('IF IsON(I1) THEN TurnON(R1); END_IF;');
    const json = astToJson(ast);
    assert.equal(json.type, 'program');
    assert.equal(json.body[0].type, 'if');
    assert.equal(json.body[0].thenBody[0].name, 'TurnON');
    assert.equal(json.body[0].thenBody[0].tag, 'R1');
  });
});

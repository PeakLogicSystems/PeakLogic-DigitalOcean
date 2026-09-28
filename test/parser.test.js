'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseProgram, validateProgram } = require('../src/engine/parser');

describe('ST parser', () => {
  it('parses IF/THEN/ELSE', () => {
    const src = `IF IsON(DI_01) THEN TurnON(Q1); END_IF;`;
    const { ast } = parseProgram(src);
    assert.equal(ast.type, 'program');
    assert.equal(ast.body[0].type, 'if');
  });

  it('parses IF/THEN/ELSIF/ELSE', () => {
    const src = [
      'IF IsON(A) THEN TurnON(X);',
      'ELSIF IsON(B) THEN TurnON(Y);',
      'ELSIF IsON(C) THEN TurnON(Z);',
      'ELSE TurnON(W);',
      'END_IF;',
    ].join(' ');
    const { ast, errors } = parseProgram(src);
    assert.deepEqual(errors, []);
    const iff = ast.body[0];
    assert.equal(iff.type, 'if');
    assert.equal(iff.thenBody.length, 1);
    assert.equal(iff.elsif.length, 2);
    assert.equal(iff.elsif[0].body[0].tag, 'Y');
    assert.equal(iff.elsif[1].body[0].tag, 'Z');
    assert.equal(iff.elseBody[0].tag, 'W');
  });

  it('parses WithInLimits', () => {
    const src = `IF WithInLimits(AI, 1.0, 9.0) THEN TurnOFF(Q); END_IF;`;
    const { ast } = parseProgram(src);
    assert.equal(ast.body[0].cond.type, 'call');
  });

  it('parses CounterCu with input tag', () => {
    const { ast } = parseProgram('CounterCu(CTR, DI);');
    assert.equal(ast.body[0].type, 'action');
    assert.equal(ast.body[0].name, 'CounterCu');
    assert.equal(ast.body[0].tag, 'CTR');
    assert.equal(ast.body[0].inputTag, 'DI');
  });

  it('parses OneShot in IF', () => {
    const { ast } = parseProgram('IF OneShot(OS1) THEN TurnON(R1); END_IF;');
    assert.equal(ast.body[0].cond.name, 'OneShot');
    assert.deepEqual(ast.body[0].cond.args, ['OS1']);
  });

  it('parses SetInt assignment', () => {
    const { ast, errors } = parseProgram('SetInt(MOTOR1_STA, 1);');
    assert.deepEqual(errors, []);
    assert.equal(ast.body[0].type, 'action');
    assert.equal(ast.body[0].name, 'SetInt');
    assert.equal(ast.body[0].tag, 'MOTOR1_STA');
  });

  it('validates unknown tags', () => {
    const src = `IF IsON(UNKNOWN) THEN TurnON(Q); END_IF;`;
    const { ast } = parseProgram(src);
    const errs = validateProgram(ast, ['Q']);
    assert.ok(errs.some((e) => e.includes('UNKNOWN')));
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseProgram } = require('../src/engine/parser');
const { compileProgramBytecode, bytecodeToBase64 } = require('../src/engine/stBytecode');
const { BC_MAGIC } = require('../src/engine/stOpcodes');
const { buildOptaProgramBody } = require('../src/parc/mqttOptaProgram');

describe('stBytecode', () => {
  it('compiles IF with ELSIF chain', () => {
    const tagStore = {
      list: () => [
        { id: 'A', type: 'BOOL', role: 'input' },
        { id: 'B', type: 'BOOL', role: 'input' },
        { id: 'Y', type: 'BOOL', role: 'output' },
      ],
    };
    const src = 'IF IsON(A) THEN TurnON(Y); ELSIF IsON(B) THEN TurnOFF(Y); END_IF;';
    const built = buildOptaProgramBody(src, tagStore, 'opta_st_01');
    assert.equal(built.ok, true);
    assert.ok(built.body.bc);
  });

  it('compiles minimal IF program', () => {
    const tagStore = {
      list: () => [
        { id: 'I1', type: 'BOOL', role: 'input' },
        { id: 'R1', type: 'BOOL', role: 'output' },
      ],
    };
    const src = 'IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;';
    const built = buildOptaProgramBody(src, tagStore, 'opta_st_01');
    assert.equal(built.ok, true);
    assert.ok(built.body.bc);
    const raw = Buffer.from(built.body.bc, 'base64');
    assert.equal(raw.slice(0, 4).toString(), BC_MAGIC.toString());
    assert.ok(raw.length < 256);
  });

  it('round-trips tag table in header', () => {
    const { ast } = parseProgram('IF IsON(I1) THEN TurnON(R1); END_IF;');
    const tagIds = ['I1', 'R1'];
    const tags = [{ id: 'I1', type: 'BOOL' }, { id: 'R1', type: 'BOOL' }];
    const { bytecode: buf } = compileProgramBytecode(ast, tagIds, tags);
    const tagCount = buf.readUInt16LE(6);
    assert.equal(tagCount, 2);
    let off = 10;
    const names = [];
    for (let i = 0; i < tagCount; i++) {
      const nlen = buf.readUInt8(off++);
      names.push(buf.slice(off, off + nlen).toString());
      off += nlen + 2; // type + flags
    }
    assert.deepEqual(names, ['I1', 'R1']);
  });

  it('parses bytecode code/data stats', () => {
    const built = buildOptaProgramBody(
      'IF IsON(I1) THEN TurnON(R1); END_IF;',
      { list: () => [{ id: 'I1', type: 'BOOL' }, { id: 'R1', type: 'BOOL' }] },
      'x',
    );
    const { parseBytecodeStats } = require('../src/engine/stBytecode');
    const stats = parseBytecodeStats(Buffer.from(built.body.bc, 'base64'));
    assert.ok(stats);
    assert.ok(stats.codeBytes > 0);
    assert.ok(stats.dataBytes > 0);
    assert.equal(stats.totalBytes, stats.codeBytes + stats.dataBytes);
  });

  it('compiles SetInt assignment', () => {
    const tagStore = {
      list: () => [{ id: 'MOTOR1_STA', type: 'INT', role: 'memory' }],
    };
    const built = buildOptaProgramBody('SetInt(MOTOR1_STA, 1);', tagStore, 'opta_st_01');
    assert.equal(built.ok, true);
    assert.ok(built.body.bc);
  });

  it('emits TRACE_PEEK ops and traceMap for IF program', () => {
    const { ast } = parseProgram('IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;');
    const tagIds = ['I1', 'R1'];
    const tags = [{ id: 'I1', type: 'BOOL' }, { id: 'R1', type: 'BOOL' }];
    const { bytecode, traceMap } = compileProgramBytecode(ast, tagIds, tags);
    assert.ok(traceMap.length > 0);
    assert.ok(traceMap.every((m) => m.k && m.s != null && m.e != null));
    const { OP } = require('../src/engine/stOpcodes');
    let off = 10;
    const tagCount = bytecode.readUInt16LE(6);
    for (let i = 0; i < tagCount; i++) {
      const nlen = bytecode.readUInt8(off++);
      off += nlen + 2;
    }
    const codeEnd = off + bytecode.readUInt16LE(8);
    let peekCount = 0;
    for (let p = off; p < codeEnd; p++) {
      if (bytecode[p] === OP.TRACE_PEEK) peekCount++;
    }
    assert.ok(peekCount > 0);
    assert.equal(peekCount, traceMap.length);
  });
});

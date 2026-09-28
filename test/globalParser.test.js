'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseProgram,
  validateProgram,
  collectProgramTagRefs,
  collectProgramGlobalDecls,
} = require('../src/engine/parser');
const { compileProgramBytecode } = require('../src/engine/stBytecode');
const { META_GLOBAL } = require('../src/engine/stOpcodes');
const { TagStore } = require('../src/tags/tagStore');
const { ensureProgramTags } = require('../src/programs/ensureProgramTags');
const { execute, createContext } = require('../src/engine/executor');

describe('globalParser', () => {
  it('parses GLOBAL GB/GI/GR declarations', () => {
    const src = `
      GLOBAL GB PumpRun;
      GLOBAL GI CounterVal;
      GLOBAL GR LevelSP;
      IF IsON(PumpRun) THEN TurnON(PumpRun); END_IF;
    `;
    const { ast, errors } = parseProgram(src);
    assert.equal(errors.length, 0);
    assert.equal(ast.globals.length, 3);
    assert.equal(ast.globals[0].name, 'PumpRun');
    assert.equal(ast.globals[0].globalType, 'GB');
    assert.deepEqual(collectProgramTagRefs(ast), ['CounterVal', 'LevelSP', 'PumpRun'].sort());
  });

  it('parses VAR_GLOBAL BOOL|INT|REAL declarations', () => {
    const src = 'VAR_GLOBAL BOOL SharedRun; VAR_GLOBAL REAL SharedLevel; SetInt(SharedLevel, 1);';
    const { ast, errors } = parseProgram(src);
    assert.equal(errors.length, 0);
    assert.equal(ast.globals.length, 2);
    assert.equal(ast.globals[0].globalType, 'GLOBAL_BOOL');
    assert.equal(ast.globals[1].globalType, 'GLOBAL_REAL');
  });

  it('validateProgram accepts declared globals without tag store entry', () => {
    const src = 'GLOBAL GB PumpRun; IF IsON(PumpRun) THEN TurnON(PumpRun); END_IF;';
    const { ast } = parseProgram(src);
    const errs = validateProgram(ast, []);
    assert.deepEqual(errs, []);
  });

  it('auto-creates global tag store entries from source', () => {
    const tagStore = new TagStore();
    const src = 'GLOBAL GI MyCount; SetInt(MyCount, 5);';
    const { added } = ensureProgramTags(tagStore, src);
    assert.ok(added.includes('MyCount'));
    const tag = tagStore.get('MyCount');
    assert.equal(tag.global, true);
    assert.equal(tag.type, 'GI');
    assert.equal(tag.role, 'memory');
  });

  it('executes logic against global memory tags on PC', () => {
    const tagStore = new TagStore();
    ensureProgramTags(tagStore, 'GLOBAL GB PumpRun; TurnON(PumpRun);');
    const { ast } = parseProgram('GLOBAL GB PumpRun; TurnON(PumpRun);');
    execute(ast, createContext(tagStore, new Set()));
    const tag = tagStore.get('PumpRun');
    assert.equal(tag.value, true);
    assert.equal(tag.dirty, true);
  });

  it('emits META_GLOBAL for declared globals in bytecode', () => {
    const { ast } = parseProgram('GLOBAL GB PumpRun; IF IsON(PumpRun) THEN TurnON(PumpRun); END_IF;');
    const tags = [{ id: 'PumpRun', type: 'GLOBAL_BOOL', global: true }];
    const { bytecode: buf } = compileProgramBytecode(ast, ['PumpRun'], tags);
    let off = 10;
    const nlen = buf.readUInt8(off++);
    off += nlen;
    const flags = buf.readUInt8(off + 1);
    assert.equal(flags & META_GLOBAL, META_GLOBAL);
  });

  it('collectProgramGlobalDecls returns tag meta rows', () => {
    const { ast } = parseProgram('GLOBAL GR Temp;');
    const decls = collectProgramGlobalDecls(ast);
    assert.deepEqual(decls, [{
      id: 'Temp',
      type: 'GR',
      role: 'memory',
      global: true,
    }]);
  });
});

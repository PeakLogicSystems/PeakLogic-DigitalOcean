'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  EST_FORMAT,
  EST_VERSION,
  pack,
  validate,
  apply,
  coerceImportDoc,
  blankProjectDoc,
} = require('../src/project/estFile');

describe('estFile', () => {
  const persistence = {
    _text: { 'program.st': 'IF IsON(DI) THEN TurnON(Q); END_IF;' },
    _json: { 'settings.json': { scanMs: 100, graphMaxPoints: 600 } },
    readText: (f, d) => persistence._text[f] ?? d,
    writeText: (f, v) => { persistence._text[f] = v; },
    readJson: (f, d) => persistence._json[f] ?? d,
    writeJson: (f, v) => { persistence._json[f] = v; },
  };

  const tagStore = {
    _tags: [{ id: 'DI', type: 'bool', direction: 'input', value: false }],
    list() { return this._tags; },
    count() { return this._tags.length; },
    replaceAll(tags) { this._tags = tags; },
  };

  const driverManager = {
    _drivers: [],
    list() { return this._drivers; },
    save(d) { this._drivers = d; },
    async rebuild() {},
  };

  const scanEngine = {
    running: false,
    loadSettings() {},
    loadProgram() {},
  };

  const deps = { tagStore, driverManager, scanEngine, persistence };

  it('blankProjectDoc builds a valid new-project snapshot', () => {
    const doc = blankProjectDoc('my_test');
    assert.equal(doc.format, EST_FORMAT);
    assert.equal(doc.project.name, 'my_test');
    assert.ok(doc.tags.length >= 22);
    assert.deepEqual(doc.drivers, []);
    assert.equal(doc.program, '(* New MooreVIEW project *)\n');
    assert.equal(doc.activeProgram, 'logic/program.st');
    assert.ok(doc.settings?.hmi?.screens?.length);
  });

  it('apply loads blank project into stores', async () => {
    const out = await apply(blankProjectDoc('fresh'), deps);
    assert.equal(out.project.name, 'fresh');
    assert.ok(tagStore.count() >= 22);
    assert.equal(driverManager.list().length, 0);
    const programStore = require('../src/programs/programStore');
    assert.equal(programStore.activeRel(), 'logic/program.st');
    assert.equal(programStore.readActive(), '(* New MooreVIEW project *)\n');
  });

  it('packs mooreview-est document', () => {
    const doc = pack(deps, { name: 'demo' });
    assert.equal(doc.format, EST_FORMAT);
    assert.equal(doc.version, EST_VERSION);
    assert.equal(doc.project.name, 'demo');
    assert.ok(Array.isArray(doc.tags));
  });

  it('validates format and rejects bad docs', () => {
    assert.equal(validate(null), 'Invalid JSON object');
    assert.equal(validate({ format: 'x' }), `Expected format "${EST_FORMAT}"`);
    assert.equal(validate({ format: EST_FORMAT, version: 99 }), 'Unsupported version 99');
    assert.equal(validate({ format: EST_FORMAT, version: EST_VERSION }), 'Missing tags array');
  });

  it('coerces legacy config bundle without format field', () => {
    const doc = coerceImportDoc({
      tags: [{ id: 'DI', type: 'bool', direction: 'input', value: false }],
      drivers: [{ id: 'mock1', type: 'mock', enabled: true }],
      program: 'TurnON(Q);',
    });
    assert.equal(doc.format, EST_FORMAT);
    assert.equal(doc.tags[0].role, 'input');
    assert.equal(doc.tags[0].type, 'BOOL');
  });

  it('apply loads legacy bundle and maps direction to role', async () => {
    const doc = {
      tags: [{ id: 'DI', type: 'bool', direction: 'input', value: false }],
      drivers: [{ id: 'mock1', type: 'mock', enabled: true }],
      program: 'TurnON(Q);',
    };
    const out = await apply(doc, deps);
    assert.equal(out.project.name, 'imported');
    assert.equal(tagStore.count(), 1);
    assert.equal(tagStore.list()[0].role, 'input');
  });

  it('apply loads project into stores', async () => {
    const doc = {
      format: EST_FORMAT,
      version: EST_VERSION,
      project: { name: 'loaded' },
      tags: [{ id: 'Q', type: 'bool', direction: 'output', value: false }],
      drivers: [{ id: 'mock1', type: 'mock', enabled: true }],
      program: 'TurnON(Q);',
      settings: { scanMs: 50 },
    };
    const out = await apply(doc, deps);
    assert.equal(out.project.name, 'loaded');
    assert.equal(tagStore.count(), 1);
    assert.equal(tagStore.list()[0].id, 'Q');
    const programStore = require('../src/programs/programStore');
    assert.equal(programStore.readActive(), 'TurnON(Q);');
  });
});

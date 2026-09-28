'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const programStore = require('../src/programs/programStore');
const { packArchiveFromParts, unpackArchive, ARCHIVE_FORMAT } = require('../src/project/projectArchive');
const { EST_FORMAT } = require('../src/project/estFile');

describe('projectArchive', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-archive-'));
    process.env.PEAKLOGIC_DATA = tmpDir;
    process.env.PEAKLOGIC_ST = path.join(tmpDir, 'st');
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/persistence')];
    delete require.cache[require.resolve('../src/programs/programStore')];
  });

  afterEach(() => {
    delete process.env.PEAKLOGIC_DATA;
    delete process.env.PEAKLOGIC_ST;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips project, programs, and parc in zip', () => {
    const project = {
      format: EST_FORMAT,
      version: 1,
      project: { name: 'demo' },
      tags: [{ id: 'T1', type: 'BOOL', role: 'memory' }],
      drivers: [{ id: 'D1', type: 'virtual', enabled: true }],
      activeProgram: 'logic/demo.st',
      settings: { scanMs: 100, project: { name: 'demo' } },
    };
    const programs = {
      'logic/demo.st': 'PROGRAM demo END_PROGRAM',
    };
    const parc = { devices: [] };
    const buf = packArchiveFromParts({ project, programs, activeProgram: 'logic/demo.st', parc });
    assert.ok(buf.length > 4);
    assert.equal(buf[0], 0x50);

    const unpacked = unpackArchive(buf);
    assert.equal(unpacked.manifest.format, ARCHIVE_FORMAT);
    assert.equal(unpacked.project.project.name, 'demo');
    assert.equal(unpacked.programs['logic/demo.st'], programs['logic/demo.st']);
    assert.deepEqual(unpacked.parc, parc);
  });

  it('extractHostHints strips serial ports from drivers', () => {
    const { extractHostHints } = require('../src/project/projectArchive');
    const { project, hostHints } = extractHostHints({
      format: EST_FORMAT,
      version: 1,
      project: { name: 'x' },
      tags: [],
      drivers: [{ id: 'mod1', type: 'modbus_rtu', serialPort: 'COM3' }],
      settings: { mqttParc: { brokerUrl: 'mqtt://192.168.1.1:1883' } },
    });
    assert.equal(project.drivers[0].serialPort, undefined);
    assert.equal(hostHints.drivers[0].serialPort, 'COM3');
    assert.equal(project.settings.mqttParc, undefined);
  });
});

describe('applyImportBuffer legacy json', () => {
  let tmpDir;
  let projectArchive;
  let tagStore;
  let driverManager;
  let scanEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-import-'));
    process.env.PEAKLOGIC_DATA = tmpDir;
    process.env.PEAKLOGIC_ST = path.join(tmpDir, 'st');
    fs.mkdirSync(process.env.PEAKLOGIC_ST, { recursive: true });
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/persistence')];
    delete require.cache[require.resolve('../src/programs/programStore')];
    delete require.cache[require.resolve('../src/project/projectArchive')];
    projectArchive = require('../src/project/projectArchive');
    tagStore = {
      _tags: [],
      list() { return this._tags; },
      count() { return this._tags.length; },
      replaceAll(tags) { this._tags = tags; },
    };
    driverManager = {
      _drivers: [],
      list() { return this._drivers; },
      save(d) { this._drivers = d; },
      async rebuild() {},
    };
    scanEngine = {
      running: false,
      loadSettings() {},
      loadProgram() {},
      _programTrace: [],
      _oneShotFired: new Map(),
      errors: [],
    };
  });

  afterEach(() => {
    delete process.env.PEAKLOGIC_DATA;
    delete process.env.PEAKLOGIC_ST;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads legacy .est.json with inline program', async () => {
    const doc = {
      format: EST_FORMAT,
      version: 1,
      project: { name: 'legacy-demo' },
      tags: [{ id: 'T1', type: 'BOOL', role: 'memory' }],
      drivers: [{ id: 'D1', type: 'virtual', enabled: true }],
      activeProgram: 'logic/demo.st',
      program: 'PROGRAM demo END_PROGRAM',
      settings: { scanMs: 100, project: { name: 'legacy-demo' } },
    };
    const buf = Buffer.from(JSON.stringify(doc), 'utf8');
    const out = await projectArchive.applyImportBuffer(buf, {
      tagStore,
      driverManager,
      scanEngine,
      persistence: require('../src/persistence'),
    });
    assert.equal(out.project.name, 'legacy-demo');
    assert.equal(tagStore.count(), 1);
  });
});

describe('projectStore zip library', () => {
  let tmpDir;
  let projectStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-proj-'));
    process.env.PEAKLOGIC_DATA = tmpDir;
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/persistence')];
    delete require.cache[require.resolve('../src/project/projectStore')];
    projectStore = require('../src/project/projectStore');
  });

  afterEach(() => {
    delete process.env.PEAKLOGIC_DATA;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete require.cache[require.resolve('../src/persistence')];
    delete require.cache[require.resolve('../src/project/projectStore')];
  });

  it('lists and loads .est.zip projects', () => {
    const buf = packArchiveFromParts({
      project: {
        format: EST_FORMAT,
        version: 1,
        project: { name: 'demo' },
        tags: [{ id: 'T1', type: 'BOOL', role: 'memory' }, { id: 'T2', type: 'BOOL', role: 'memory' }],
        drivers: [{ id: 'D1', type: 'virtual', enabled: true }],
        activeProgram: 'logic/demo.st',
        settings: { scanMs: 100 },
      },
      programs: { 'logic/demo.st': '(* st *)' },
      activeProgram: 'logic/demo.st',
    });
    projectStore.saveProjectArchive('demo', buf);
    const listed = projectStore.listProjects();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'demo');
    assert.equal(listed[0].tagCount, 2);
    const loaded = projectStore.loadProjectArchive('demo');
    assert.equal(loaded.project.project.name, 'demo');
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  EST_FORMAT,
  EST_VERSION,
  pack,
  validate,
  apply,
  migrateImportDoc,
  coerceImportDoc,
  exportFilename,
  blankProjectDoc,
  mergeRemoteDrivers,
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
    assert.deepEqual(doc.tags, []);
    assert.deepEqual(doc.drivers, []);
    assert.ok(doc.program.includes('New PeakLogic project'));
    assert.equal(doc.activeProgram, null);
    assert.ok(doc.settings?.hmi?.screens?.length);
  });

  it('apply loads blank project into stores', async () => {
    const out = await apply(blankProjectDoc('fresh'), deps);
    assert.equal(out.project.name, 'fresh');
    assert.equal(tagStore.count(), 0);
    assert.equal(driverManager.list().length, 0);
    const programStore = require('../src/programs/programStore');
    assert.equal(programStore.activeRel(), '');
    assert.equal(programStore.readActive(), '');
  });

  it('apply blank project clears HMI tiles and bindings in settings', async () => {
    const persistence = deps.persistence;
    persistence.writeJson('settings.json', {
      scanMs: 100,
      hmi: {
        activeScreen: 'screen_1',
        screens: [{
          id: 'screen_1',
          name: 'Home',
          svg: '/hmi/svg/demos/demo_process.svg',
          tiles: [{ col: 2, row: 3, colSpan: 1, rowSpan: 1, layers: [{ kind: 'dynamicImage', path: '/hmi/svg/foo.svg' }] }],
        }],
        bindings: [{ screenId: 'screen_1', elementId: 't2_3_z0__lamp', tagId: 'DI', property: 'fill' }],
      },
    });
    await apply(blankProjectDoc('cleared_hmi'), deps);
    const settings = persistence.readJson('settings.json', {});
    assert.equal(settings.hmi?.screens?.length, 1);
    assert.deepEqual(settings.hmi?.screens?.[0]?.tiles || [], []);
    assert.deepEqual(settings.hmi?.bindings || [], []);
  });

  it('apply project snapshot clears retained tag forces', async () => {
    const { TagStore } = require('../src/tags/tagStore');
    const store = new TagStore();
    store.replaceAll([{ id: 'Q', type: 'BOOL', role: 'output', value: false }]);
    store.setForce('Q', { forceOutput: true, forceValue: true });
    const localDeps = {
      ...deps,
      tagStore: store,
      graphHistory: { clear() {} },
    };
    await apply(blankProjectDoc('cleared'), localDeps);
    assert.equal(store.count(), 0);
    assert.equal(store.list().some((t) => t.forceOutput), false);
  });

  it('packs peaklogic-est document', () => {
    const doc = pack(deps, { name: 'demo' });
    assert.equal(doc.format, EST_FORMAT);
    assert.equal(doc.version, EST_VERSION);
    assert.ok(doc.exportedBy);
    assert.equal(doc.project.name, 'demo');
    assert.equal(doc.settings.project.name, 'demo');
    assert.ok(Array.isArray(doc.tags));
  });

  it('pack uses settings project name when save meta omits name', () => {
    persistence.writeJson('settings.json', {
      scanMs: 100,
      graphMaxPoints: 600,
      project: { name: 'line_a' },
    });
    const doc = pack(deps, {});
    assert.equal(doc.project.name, 'line_a');
    assert.equal(doc.settings.project.name, 'line_a');
  });

  it('pack omits startup from embedded settings', () => {
    persistence.writeJson('settings.json', {
      scanMs: 100,
      startup: { mode: 'saved_project', projectId: 'alf', promptOnBoot: false },
    });
    const doc = pack(deps, { name: 'demo' });
    assert.equal(doc.settings.scanMs, 100);
    assert.equal(doc.settings.startup, undefined);
  });

  it('validates format and rejects bad docs', () => {
    assert.equal(validate(null), 'Invalid JSON object');
    assert.equal(validate({ format: 'x' }), 'Expected "peaklogic-est" or JSON with tags, drivers, and/or program');
    assert.equal(validate({
      format: EST_FORMAT,
      version: 99,
      tags: [],
      drivers: [],
      program: '(* test *)',
      settings: { project: { name: 'x' } },
    }), null);
    assert.equal(validate({ format: EST_FORMAT, version: EST_VERSION }), null);
  });

  it('migrates older and newer peaklogic-est format versions', () => {
    const older = migrateImportDoc({
      format: EST_FORMAT,
      version: 0,
      project: { name: 'legacy' },
      tags: [{ id: 'DI', type: 'bool', direction: 'input', value: false }],
      drivers: [],
      program: '(* old *)',
      settings: { project: { name: 'legacy' } },
    });
    assert.equal(older.doc.version, EST_VERSION);
    assert.ok(older.warnings.some((w) => /Upgraded project/i.test(w)));

    const newer = migrateImportDoc({
      format: EST_FORMAT,
      version: EST_VERSION + 2,
      project: { name: 'future' },
      tags: [],
      drivers: [],
      program: '(* future *)',
      settings: { project: { name: 'future' } },
    });
    assert.equal(newer.doc.version, EST_VERSION);
    assert.ok(newer.warnings.some((w) => /newer than this PeakLogic/i.test(w)));
  });

  it('exportFilename sanitizes project names', () => {
    assert.equal(exportFilename('My Pool v2'), 'My_Pool_v2.est.json');
    assert.equal(exportFilename(''), 'project.est.json');
  });

  it('apply accepts older format version and returns import warnings', async () => {
    const doc = {
      format: EST_FORMAT,
      version: 0,
      project: { name: 'old_fmt' },
      tags: [{ id: 'Q', type: 'bool', direction: 'output', value: false }],
      drivers: [{ id: 'mock1', type: 'mock', enabled: true }],
      program: 'TurnON(Q);',
      settings: { scanMs: 50, project: { name: 'old_fmt' } },
    };
    const out = await apply(doc, deps);
    assert.equal(out.project.name, 'old_fmt');
    assert.ok(Array.isArray(out.importWarnings));
    assert.ok(out.importWarnings.length > 0);
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
      activeProgram: 'logic/program.st',
      settings: { scanMs: 50, activeProgram: 'logic/program.st', project: { name: 'untitled_2' } },
    };
    const out = await apply(doc, deps);
    assert.equal(out.project.name, 'loaded');
    assert.equal(persistence.readJson('settings.json', {}).project.name, 'loaded');
    assert.equal(tagStore.count(), 1);
    assert.equal(tagStore.list()[0].id, 'Q');
    const programStore = require('../src/programs/programStore');
    assert.equal(programStore.activeRel(), 'logic/program.st');
    assert.equal(programStore.readActive(), 'TurnON(Q);');
  });

  it('apply preserves mqtt_parc drivers missing from workspace snapshot', async () => {
    driverManager._drivers = [
      { id: 'mock1', type: 'mock', enabled: true },
      { id: 'opta_st_01', type: 'mqtt_parc', enabled: true, deviceId: 'opta_st_01' },
    ];
    const doc = blankProjectDoc('ws');
    doc.drivers = [{ id: 'mock1', type: 'mock', enabled: true }];
    await apply(doc, deps);
    const ids = driverManager.list().map((d) => d.id);
    assert.deepEqual(ids, ['mock1', 'opta_st_01']);
  });

  it('apply preserves startup preference over embedded snapshot', async () => {
    persistence.writeJson('settings.json', {
      scanMs: 100,
      startup: { mode: 'saved_project', projectId: 'alf', promptOnBoot: false },
    });
    const doc = blankProjectDoc('untitled');
    doc.settings = {
      ...doc.settings,
      startup: { mode: 'saved_project', projectId: 'untitled', promptOnBoot: true },
    };
    await apply(doc, deps);
    const settings = persistence.readJson('settings.json', {});
    assert.equal(settings.startup.mode, 'saved_project');
    assert.equal(settings.startup.projectId, 'alf');
    assert.equal(settings.startup.promptOnBoot, false);
  });

  it('apply preserves autoStartRuntime from prev settings over workspace embed', async () => {
    persistence.writeJson('settings.json', {
      scanMs: 100,
      autoStartRuntime: true,
    });
    const doc = blankProjectDoc('ws');
    doc.settings = {
      ...doc.settings,
      autoStartRuntime: false,
    };
    await apply(doc, deps);
    const settings = persistence.readJson('settings.json', {});
    assert.equal(settings.autoStartRuntime, true);
  });

  it('apply blank project with reset clears remote drivers and prev mqtt/activeProgram', async () => {
    persistence.writeJson('settings.json', {
      scanMs: 100,
      activeProgram: 'logic/24_motor_tpo_combined.st',
      remoteExecution: true,
      autoStartRuntime: true,
      project: { name: 'old_pool', lastOpenedId: 'old_pool' },
      mqttParc: {
        enabled: true,
        brokerUrl: 'mqtt://192.168.1.233:1883',
        autoDiscoverDrivers: true,
      },
    });
    driverManager._drivers = [
      { id: 'mock1', type: 'mock', enabled: true },
      { id: 'opta_st_01', type: 'mqtt_parc', enabled: true, deviceId: 'opta_st_01' },
    ];
    const programStore = require('../src/programs/programStore');
    programStore.setActive('logic/24_motor_tpo_combined.st');
    const out = await apply(blankProjectDoc('brand_new'), deps, { reset: true, prunePrograms: true });
    const settings = persistence.readJson('settings.json', {});
    assert.equal(out.project.name, 'brand_new');
    assert.equal(settings.project.name, 'brand_new');
    assert.equal(settings.project.lastOpenedId, null);
    assert.equal(driverManager.list().length, 0);
    assert.equal(programStore.activeRel(), '');
    assert.equal(settings.activeProgram, null);
    assert.equal(settings.remoteExecution, false);
    assert.notEqual(settings.mqttParc.brokerUrl, 'mqtt://192.168.1.233:1883');
    assert.equal(settings.mqttParc.autoDiscoverDrivers, false);
    assert.equal(settings.autoStartRuntime, undefined);
  });

  it('apply preserves mqttParc toggles and activeProgram from prev settings', async () => {
    persistence.writeJson('settings.json', {
      scanMs: 100,
      activeProgram: 'logic/24_motor_tpo_combined.st',
      mqttParc: {
        enabled: true,
        brokerUrl: 'mqtt://192.168.1.233:1883',
        autoDiscoverDrivers: true,
      },
    });
    const programStore = require('../src/programs/programStore');
    programStore.setActive('logic/24_motor_tpo_combined.st');
    const doc = blankProjectDoc('ws');
    doc.activeProgram = null;
    doc.settings = {
      ...doc.settings,
      mqttParc: { brokerUrl: 'mqtt://127.0.0.1:1883' },
      activeProgram: null,
    };
    await apply(doc, deps);
    const settings = persistence.readJson('settings.json', {});
    assert.equal(settings.mqttParc.enabled, true);
    assert.equal(settings.mqttParc.autoDiscoverDrivers, true);
    assert.equal(settings.mqttParc.brokerUrl, 'mqtt://127.0.0.1:1883');
    assert.equal(programStore.activeRel(), 'logic/24_motor_tpo_combined.st');
  });

  it('apply blank project clears tags for workspace snapshot', async () => {
    tagStore.replaceAll([{ id: 'OLD', type: 'BOOL', role: 'memory', value: false }]);
    persistence.writeJson('workspace.est.json', {
      format: EST_FORMAT,
      version: EST_VERSION,
      project: { name: 'old' },
      tags: [{ id: 'OLD', type: 'BOOL', role: 'memory', value: false }],
      drivers: [],
      program: '(* old *)',
      settings: { project: { name: 'old' } },
    });
    const out = await apply(blankProjectDoc('fresh'), deps);
    persistence.writeJson('workspace.est.json', out);
    assert.equal(tagStore.count(), 0);
    const ws = persistence.readJson('workspace.est.json', null);
    assert.deepEqual(ws.tags, []);
  });

  it('mergeRemoteDrivers keeps remote drivers not in incoming list', () => {
    const merged = mergeRemoteDrivers(
      [{ id: 'mock1', type: 'mock' }],
      [{ id: 'opta_st_01', type: 'mqtt_parc', enabled: true }],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[1].id, 'opta_st_01');
  });
});

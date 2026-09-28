'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { ScanEngine, shouldAutoStartRuntime } = require('../src/runtime/scanEngine');
const { GraphHistory } = require('../src/runtime/graphHistory');
const mongoTagLogger = require('../src/logger/mongoTagLogger');
const programStore = require('../src/programs/programStore');

function stubEngine(opts = {}) {
  const tags = opts.tags || [];
  const tagStore = {
    list: () => tags,
    applyForcesAfterRead: () => {},
    applyForcesAfterLogic: () => {},
  };
  const driverManager = {
    hasConnectedRtu: () => true,
    rebuild: async () => {},
    readAll: async () => {},
    writeAll: async () => {},
    configs: [],
    instances: new Map(),
  };
  const graphHistory = opts.graphHistory === null ? null : new GraphHistory(10);
  const engine = new ScanEngine(tagStore, driverManager, graphHistory);
  engine.ast = { type: 'program', body: [] };
  engine.running = true;
  engine.scanMs = 50;
  engine._graphPens = opts.graphPens || [];
  return { engine, graphHistory, tagStore };
}

describe('scanEngine pause', () => {
  it('pause clears timer and resume reschedules', () => {
    const { engine } = stubEngine();
    engine._schedule();
    assert.ok(engine.timer);
    engine.pause();
    assert.equal(engine.paused, true);
    assert.equal(engine.timer, null);
    engine.resume();
    assert.equal(engine.paused, false);
    assert.ok(engine.timer);
    engine.stop();
  });

  it('start resumes when already running and paused', async () => {
    const { engine } = stubEngine();
    engine.pause();
    engine.running = true;
    engine.paused = true;
    await engine.start();
    assert.equal(engine.paused, false);
    assert.ok(engine.timer);
    engine.stop();
  });

  it('start coalesces concurrent calls via _starting guard', async () => {
    const { engine } = stubEngine();
    engine.running = false;
    engine.remoteExecution = true;
    engine.driverManager.configs = [{ id: 'opta_st_01', type: 'mqtt_parc', enabled: true }];
    let deployCalls = 0;
    engine._findRemoteDriver = () => ({
      connected: true,
      cfg: { deviceId: 'opta_st_01', id: 'opta_st_01' },
      ensureConnected: async () => true,
      deployProgram: async () => {
        deployCalls += 1;
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true, errors: [] };
      },
      startRuntime: async () => {},
    });
    engine.loadSettings = () => { engine.remoteExecution = true; };
    const origEnsure = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    const origWait = require('../src/parc/waitForParcDevice').waitForParcDeviceTelemetry;
    const origCmd = require('../src/parc/waitForParcDevice').waitForParcCmdHealth;
    const origRead = programStore.readActive;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    require('../src/parc/waitForParcDevice').waitForParcDeviceTelemetry = async () => ({ ok: true });
    require('../src/parc/waitForParcDevice').waitForParcCmdHealth = async () => ({ ok: true });
    programStore.readActive = () => '(* concurrent deploy test *)';
    programStore.ensureActiveProgram = () => 'logic/test.st';
    try {
      await Promise.all([engine.start(), engine.start()]);
      assert.equal(deployCalls, 1);
      assert.equal(engine.running, true);
    } finally {
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origEnsure;
      require('../src/parc/waitForParcDevice').waitForParcDeviceTelemetry = origWait;
      require('../src/parc/waitForParcDevice').waitForParcCmdHealth = origCmd;
      programStore.readActive = origRead;
      engine.stop();
    }
  });

  it('stop clears paused state', () => {
    const { engine } = stubEngine();
    engine.pause();
    engine.stop();
    assert.equal(engine.running, false);
    assert.equal(engine.paused, false);
    assert.equal(engine.timer, null);
  });

  it('loadProgram accepts empty source (historian / API-only projects)', () => {
    const { engine } = stubEngine();
    const orig = programStore.readActive;
    programStore.readActive = () => '';
    try {
      const r = engine.loadProgram();
      assert.equal(r.ok, true);
      assert.equal(engine.ast?.type, 'program');
      assert.deepEqual(engine.ast?.body, []);
    } finally {
      programStore.readActive = orig;
    }
  });
});

describe('scanEngine historian archive', () => {
  let origLogPenSamples;

  before(() => {
    origLogPenSamples = mongoTagLogger.logPenSamples;
  });

  after(() => {
    mongoTagLogger.logPenSamples = origLogPenSamples;
  });

  it('records graphEnabled tags and logs mongo samples without configured pens', async () => {
    const tags = [
      { id: 'AI1', type: 'INT', graphEnabled: true, value: 42, quality: 'good' },
      { id: 'AI2', type: 'REAL', graphEnabled: false, value: 1, quality: 'good' },
      { id: 'X', type: 'STRING', graphEnabled: true, value: 'n/a', quality: 'good' },
    ];
    const { engine, graphHistory } = stubEngine({ tags, graphPens: [] });
    let logged = null;
    mongoTagLogger.logPenSamples = async (args) => {
      logged = args;
      return { ok: true };
    };
    await engine._tick();
    engine.stop();
    assert.ok(graphHistory.buffers.has('AI1'));
    assert.equal(graphHistory.buffers.has('AI2'), false);
    assert.ok(logged);
    assert.deepEqual(logged.pens.map((p) => p.tagId), ['AI1']);
    assert.equal(logged.tags, tags);
  });
});

describe('shouldAutoStartRuntime', () => {
  it('only auto-starts when explicitly enabled in settings', () => {
    assert.equal(shouldAutoStartRuntime({}, [{ type: 'nextcentury', enabled: true }]), false);
    assert.equal(shouldAutoStartRuntime({}, [{ type: 'modbus_rtu', enabled: true }]), false);
    assert.equal(shouldAutoStartRuntime({ autoStartRuntime: false }, [{ type: 'nextcentury', enabled: true }]), false);
    assert.equal(shouldAutoStartRuntime({ autoStartRuntime: true }, []), true);
  });
});

describe('scanEngine remote driver selection', () => {
  it('_findRemoteDriver prefers live Parc registry device over template opta_st_01', () => {
    const { registry } = require('../src/parc/deviceRegistry');
    registry.ingestReport({
      deviceId: 'opta_0123b636f1c23964ee',
      tags: [],
      runtime: { running: false },
    });
    const tagStore = {
      list: () => [{ id: 'I1', driverId: 'opta_st_01' }],
    };
    const driverManager = {
      configs: [
        { id: 'opta_st_01', type: 'mqtt_parc', enabled: true, deviceId: 'opta_st_01' },
        {
          id: 'opta_0123b636f1c23964ee',
          type: 'mqtt_parc',
          enabled: true,
          deviceId: 'opta_0123b636f1c23964ee',
          ateccSerial: '0123b636f1c23964ee',
        },
      ],
      instances: new Map([
        ['opta_st_01', { connected: false, cfg: { deviceId: 'opta_st_01' } }],
        ['opta_0123b636f1c23964ee', { connected: true, cfg: { deviceId: 'opta_0123b636f1c23964ee' } }],
      ]),
    };
    const engine = new ScanEngine(tagStore, driverManager, null);
    engine.remoteExecution = true;
    const remote = engine._findRemoteDriver();
    assert.equal(remote.cfg.deviceId, 'opta_0123b636f1c23964ee');
  });
});

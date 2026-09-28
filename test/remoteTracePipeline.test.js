'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const persistence = require('../src/persistence');
const { ScanEngine } = require('../src/runtime/scanEngine');
const { registry } = require('../src/parc/deviceRegistry');
const { buildOptaProgramBody } = require('../src/parc/mqttOptaProgram');
const { TagStore } = require('../src/tags/tagStore');

describe('remote trace pipeline', () => {
  it('deploy body includes traceMap for IF program', () => {
    const tagStore = new TagStore();
    tagStore.replaceAll([
      { id: 'I1', type: 'BOOL', role: 'input', value: true },
      { id: 'R1', type: 'BOOL', role: 'output', value: false },
    ]);
    const built = buildOptaProgramBody(
      'IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;',
      tagStore,
      'opta_st_01',
    );
    assert.equal(built.ok, true);
    assert.ok(built.body.bc);
    assert.ok(Array.isArray(built.body.traceMap));
    assert.ok(built.body.traceMap.length > 0);
    assert.ok(built.body.traceMap.every((m) => m.k && m.s != null && m.e != null));

    const { slimPutProgramBodyForMqtt } = require('../src/parc/mqttOptaProgram');
    const mqttBody = slimPutProgramBodyForMqtt(built.body, built.traceMap);
    assert.equal(mqttBody.traceMap, undefined);
    assert.equal(mqttBody.tracePointCount, built.traceMap.length);
  });

  it('scanEngine status exposes remoteTracePending until telemetry', () => {
    const deviceId = 'opta_remote_trace_status';
    const orig = persistence.readJson;
    persistence.readJson = (file, def) => {
      if (file === 'settings.json') return { scanMs: 100, remoteExecution: true };
      return orig(file, def);
    };
    const tagStore = new TagStore();
    tagStore.replaceAll([
      { id: 'I1', type: 'BOOL', role: 'input', value: true },
      { id: 'R1', type: 'BOOL', role: 'output', value: false },
    ]);
    const built = buildOptaProgramBody('IF IsON(I1) THEN TurnON(R1); END_IF;', tagStore, deviceId);
    const remoteDrv = {
      connected: true,
      cfg: { deviceId },
      _traceMap: built.traceMap,
      hasTraceMap() { return this._traceMap.length > 0; },
      isTracePending() {
        const compact = registry.getDevice(deviceId)?.programTrace;
        return !(Array.isArray(compact) && compact.length > 0);
      },
      getProgramTrace() {
        const compact = registry.getDevice(deviceId)?.programTrace;
        if (!compact?.length) return [];
        const { expandRemoteProgramTrace } = require('../src/parc/remoteProgramTrace');
        return expandRemoteProgramTrace(this._traceMap, compact);
      },
    };
    const dm = {
      configs: [{ id: deviceId, type: 'mqtt_parc', enabled: true }],
      instances: new Map([[deviceId, remoteDrv]]),
      list: () => dm.configs,
      hasConnectedRtu: () => false,
      rebuild: async () => {},
      readAll: async () => {},
      writeAll: async () => {},
    };
    registry.ingestReport({ deviceId, tags: [], programTrace: [] });
    try {
      const engine = new ScanEngine(tagStore, dm, null);
      engine.loadSettings();
      engine.ast = { type: 'program', body: [], remote: true };
      engine.running = true;
      engine.paused = false;

      let st = engine.status();
      assert.equal(st.remoteScanOnDevice, true);
      assert.equal(st.remoteTracePending, true);
      assert.deepEqual(st.programTrace, []);

      registry.ingestReport({
        deviceId,
        programTrace: [[0, 1]],
        tags: [],
      });
      st = engine.status();
      assert.equal(st.remoteTracePending, false);
      assert.ok(st.programTrace.length > 0);
    } finally {
      persistence.readJson = orig;
    }
  });
});

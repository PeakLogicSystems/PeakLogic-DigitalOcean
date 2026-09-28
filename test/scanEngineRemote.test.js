'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const persistence = require('../src/persistence');
const { ScanEngine } = require('../src/runtime/scanEngine');

const { TagStore } = require('../src/tags/tagStore');

function mockTagStore() {
  return { list: () => [], count: () => 0, get: () => null, upsert: () => {} };
}

function mockDriverManager(remoteEnabled) {
  const configs = [{ id: 'opta_st_01', type: 'mqtt_parc', enabled: true, remoteExecution: true }];
  const instances = new Map([['opta_st_01', { connected: true }]]);
  return {
    configs,
    instances,
    list: () => configs,
    hasConnectedRtu: () => false,
    rebuild: async () => {},
    readAll: async () => {},
    writeAll: async () => {},
    _settingsRemote: remoteEnabled,
  };
}

describe('scanEngine remote execution', () => {
  it('_findRemoteDriver respects settings.remoteExecution', () => {
    const orig = persistence.readJson;
    persistence.readJson = (file, def) => {
      if (file === 'settings.json') return { scanMs: 100, remoteExecution: false };
      return orig(file, def);
    };
    try {
      const engine = new ScanEngine(mockTagStore(), mockDriverManager(), null);
      engine.loadSettings();
      assert.equal(engine.remoteExecution, false);
      assert.equal(engine._findRemoteDriver(), null);
    } finally {
      persistence.readJson = orig;
    }
  });

  it('_findRemoteDriver returns mqtt_parc when remoteExecution on', () => {
    const orig = persistence.readJson;
    persistence.readJson = (file, def) => {
      if (file === 'settings.json') return { scanMs: 100, remoteExecution: true };
      return orig(file, def);
    };
    try {
      const dm = mockDriverManager(true);
      const engine = new ScanEngine(mockTagStore(), dm, null);
      engine.loadSettings();
      assert.equal(engine._findRemoteDriver(), dm.instances.get('opta_st_01'));
    } finally {
      persistence.readJson = orig;
    }
  });

  it('start runs ST on PC when remoteExecution on but no mqtt_parc driver', async () => {
    const orig = persistence.readJson;
    const programStore = require('../src/programs/programStore');
    const origRead = programStore.readActive;
    persistence.readJson = (file, def) => {
      if (file === 'settings.json') return { scanMs: 100, remoteExecution: true };
      return orig(file, def);
    };
    programStore.readActive = () => '';
    try {
      const dm = {
        configs: [{ id: 'mock1', type: 'mock', enabled: true }],
        instances: new Map(),
        list: () => dm.configs,
        hasConnectedRtu: () => false,
        hasEnabledFieldbus: () => false,
        rebuild: async () => {},
        readAll: async () => {},
        writeAll: async () => {},
      };
      const engine = new ScanEngine(mockTagStore(), dm, null);
      try {
        await engine.start();
        assert.equal(engine.running, true);
        assert.equal(engine.ast?.remote, undefined);
      } finally {
        await engine.stop();
      }
    } finally {
      persistence.readJson = orig;
      programStore.readActive = origRead;
    }
  });

  it('start falls back to local fieldbus when remoteExecution on but no mqtt_parc', async () => {
    const orig = persistence.readJson;
    const programStore = require('../src/programs/programStore');
    const origRead = programStore.readActive;
    persistence.readJson = (file, def) => {
      if (file === 'settings.json') return { scanMs: 100, remoteExecution: true };
      return orig(file, def);
    };
    programStore.readActive = () => '';
    try {
      const dm = {
        configs: [{ id: 'dat10148', type: 'modbus_rtu', enabled: true, serialPort: 'COM11' }],
        instances: new Map(),
        list: () => dm.configs,
        hasConnectedRtu: () => false,
        hasEnabledFieldbus: () => true,
        rebuild: async () => {},
        readAll: async () => {},
        writeAll: async () => {},
      };
      const engine = new ScanEngine(new TagStore(), dm, null);
      try {
        await engine.start();
        assert.equal(engine.running, true);
        assert.equal(engine.ast?.remote, undefined);
      } finally {
        await engine.stop();
      }
    } finally {
      persistence.readJson = orig;
      programStore.readActive = origRead;
    }
  });

  it('_tick polls local fieldbus drivers during remote execution', async () => {
    let fieldbusReads = 0;
    const dm = {
      configs: [
        { id: 'opta_st_01', type: 'mqtt_parc', enabled: true },
        { id: 'dat10148', type: 'modbus_rtu', enabled: true, serialPort: 'COM11' },
      ],
      instances: new Map([
        ['opta_st_01', {
          connected: true,
          cfg: { id: 'opta_st_01', remoteExecution: true },
          runScanCycle: async () => {},
        }],
        ['dat10148', { connected: true, readBatch: async () => { fieldbusReads += 1; } }],
      ]),
      readFieldbus: async function readFieldbus() {
        for (const [id, driver] of this.instances) {
          const cfg = this.configs.find((c) => c.id === id);
          if (cfg?.type === 'modbus_rtu' && cfg.enabled) {
            await driver.readBatch([], {});
          }
        }
      },
      readHostApi: async () => {},
      writeFieldbus: async () => {},
    };
    const tagStore = {
      list: () => [],
      applyForcesAfterRead: () => {},
      applyForcesAfterLogic: () => {},
    };
    const engine = new ScanEngine(tagStore, dm, null);
    engine.running = true;
    engine.ast = { type: 'program', body: [], remote: true };
    engine.remoteExecution = true;
    try {
      await engine._tick();
      assert.equal(fieldbusReads, 1);
    } finally {
      await engine.stop();
    }
  });

  it('_tick applies output/memory forces in remote mode so forced indications hold', async () => {
    const dm = {
      configs: [{ id: 'opta_st_01', type: 'mqtt_parc', enabled: true }],
      instances: new Map([
        ['opta_st_01', {
          connected: true,
          cfg: { id: 'opta_st_01', remoteExecution: true },
          // Simulate the Opta reporting the room alarm OFF each scan.
          runScanCycle: async (store) => { store.setValue('RM101_ALM', false); },
        }],
      ]),
      readFieldbus: async () => {},
      readHostApi: async () => {},
      writeFieldbus: async () => {},
    };
    const tagStore = new TagStore();
    tagStore.replaceAll([
      { id: 'RM101_ALM', type: 'BOOL', role: 'memory', value: false },
    ]);
    // Force the local memory tag ON to test the HMI indication.
    tagStore.setForce('RM101_ALM', { forceOutput: true, forceValue: true });

    const engine = new ScanEngine(tagStore, dm, null);
    engine.running = true;
    engine.ast = { type: 'program', body: [], remote: true };
    engine.remoteExecution = true;
    try {
      await engine._tick();
      // Even though the Opta reported it OFF, the forced value must hold.
      assert.equal(tagStore.get('RM101_ALM').value, true);
    } finally {
      await engine.stop();
    }
  });
});

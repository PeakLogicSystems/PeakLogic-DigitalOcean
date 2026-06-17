'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const persistence = require('../src/persistence');
const { ScanEngine } = require('../src/runtime/scanEngine');

function mockDriverManager(remoteEnabled) {
  const configs = [{ id: 'opta_eth', type: 'opta_remote', enabled: true, remoteExecution: true }];
  const instances = new Map([['opta_eth', { connected: true }]]);
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
      const engine = new ScanEngine({}, mockDriverManager(), null);
      engine.loadSettings();
      assert.equal(engine.remoteExecution, false);
      assert.equal(engine._findRemoteDriver(), null);
    } finally {
      persistence.readJson = orig;
    }
  });

  it('_findRemoteDriver returns opta_remote when remoteExecution on', () => {
    const orig = persistence.readJson;
    persistence.readJson = (file, def) => {
      if (file === 'settings.json') return { scanMs: 100, remoteExecution: true };
      return orig(file, def);
    };
    try {
      const dm = mockDriverManager(true);
      const engine = new ScanEngine({}, dm, null);
      engine.loadSettings();
      assert.equal(engine._findRemoteDriver(), dm.instances.get('opta_eth'));
    } finally {
      persistence.readJson = orig;
    }
  });
});

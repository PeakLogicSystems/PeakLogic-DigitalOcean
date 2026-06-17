'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { ScanEngine } = require('../src/runtime/scanEngine');

function stubEngine() {
  const tagStore = {
    list: () => [],
    applyForcesAfterRead: () => {},
    applyForcesAfterLogic: () => {},
  };
  const driverManager = {
    hasConnectedRtu: () => true,
    rebuild: async () => {},
    readAll: async () => {},
    writeAll: async () => {},
  };
  const engine = new ScanEngine(tagStore, driverManager, null);
  engine.ast = { type: 'program', body: [] };
  engine.running = true;
  engine.scanMs = 50;
  return engine;
}

describe('scanEngine pause', () => {
  it('pause clears timer and resume reschedules', () => {
    const engine = stubEngine();
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
    const engine = stubEngine();
    engine.pause();
    engine.running = true;
    engine.paused = true;
    await engine.start();
    assert.equal(engine.paused, false);
    assert.ok(engine.timer);
    engine.stop();
  });

  it('stop clears paused state', () => {
    const engine = stubEngine();
    engine.pause();
    engine.stop();
    assert.equal(engine.running, false);
    assert.equal(engine.paused, false);
    assert.equal(engine.timer, null);
  });
});

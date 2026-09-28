'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  classifyStart,
  generateMotorStartSimDocs,
} = require('../src/pdm/motorStartSim');

describe('motorStartSim', () => {
  it('classifies long starts as capacitor faults', () => {
    assert.equal(classifyStart(1500).label, 'healthy');
    assert.equal(classifyStart(3500).label, 'capacitor_weak');
    assert.equal(classifyStart(5500).label, 'capacitor_failed');
  });

  it('generates degrading start events over 90 days', () => {
    const sim = generateMotorStartSimDocs({ days: 90, startsPerDay: 2, now: Date.parse('2026-06-12T12:00:00Z') });
    assert.ok(sim.startCount > 100);
    assert.equal(sim.edgeDocs.length, sim.startCount);
    assert.equal(sim.scadaDocs.length, sim.startCount * 3);
    const first = sim.edgeDocs[0].features.startTimeMs;
    const last = sim.edgeDocs[sim.edgeDocs.length - 1].features.startTimeMs;
    assert.ok(last > first);
    assert.ok(['capacitor_weak', 'capacitor_failed'].includes(sim.degradation.finalLabel));
  });
});

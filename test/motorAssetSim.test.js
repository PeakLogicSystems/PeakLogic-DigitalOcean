'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { generateMotorAssetSimDocs } = require('../src/pdm/motorAssetSim');

describe('motorAssetSim', () => {
  it('generates pump sim with edge and pen docs over 30 days', () => {
    const sim = generateMotorAssetSimDocs({
      assetId: 'pump-2',
      days: 30,
      now: Date.parse('2026-06-12T12:00:00Z'),
      context: {
        motorType: 'pump',
        configuration: 'duplex',
        locationClass: 'restaurant',
        pumpIndex: 2,
        pumpRole: 'lag',
        installDate: '2016-01-01',
      },
    });
    assert.ok(sim.startCount > 20);
    assert.ok(sim.edgeDocs.length === sim.startCount);
    assert.ok(sim.scadaDocs.length > sim.startCount);
    assert.equal(sim.context.motorType, 'pump');
    assert.equal(sim.context.locationClass, 'restaurant');
    assert.ok(sim.edgeDocs[0].context);
  });

  it('generates fan sim docs', () => {
    const sim = generateMotorAssetSimDocs({
      assetId: 'fan-1',
      days: 45,
      now: Date.parse('2026-06-12T12:00:00Z'),
      context: { motorType: 'fan', locationClass: 'school', unitIndex: 1 },
    });
    assert.ok(sim.startCount > 10);
    assert.equal(sim.modelId, 'fan-motor-v1');
  });

  it('supports 360-day seed range', () => {
    const sim = generateMotorAssetSimDocs({
      assetId: 'pump-1',
      days: 360,
      now: Date.parse('2026-06-12T12:00:00Z'),
      context: { motorType: 'pump', configuration: 'simplex', locationClass: 'alf' },
    });
    assert.equal(sim.days, 360);
    assert.ok(sim.startCount > 200);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  buildSceneFromFacilityDraw,
  planToScene,
  normalizeDeviceMeta,
  aggregateZones,
} = require('../facility-draw/src/sceneFromFacilityDraw');

describe('facilityDraw scene from layout', () => {
  it('maps plan coordinates to scene X/Z around origin', () => {
    const pos = planToScene(10, 20, { x: 0, y: 0 }, 1);
    assert.equal(pos.x, 10);
    assert.equal(pos.z, 20);
  });

  it('builds placements and pipes from a minimal doc', () => {
    const scene = buildSceneFromFacilityDraw({
      name: 'test',
      units: 'ft',
      nodes: [
        { id: 'n1', type: 'lift_simplex', x: 0, y: 0, rotation: 0, label: 'LS-1' },
        { id: 'n2', type: 'lift_duplex', x: 40, y: 0, rotation: 0 },
      ],
      edges: [{
        id: 'e1',
        from: 'n1:outlet',
        to: 'n2:inlet',
        points: [[20, 0]],
      }],
    });
    assert.equal(scene.placements.length, 2);
    assert.equal(scene.pipes.length, 1);
    assert.equal(scene.pipes[0].points.length, 3);
    assert.equal(scene.placements[0].category, 'lift');
    assert.equal(scene.placements[0].liftKind, 'simplex');
    assert.equal(scene.placements[0].model3d, 'lift_simplex');
    assert.equal(scene.placements[0].role, 'collection');
    assert.equal(scene.placements[1].role, 'booster');
    assert.ok(Math.abs((scene.plot.minX + scene.plot.maxX) / 2) < 0.01);
    assert.ok(Math.abs((scene.plot.minZ + scene.plot.maxZ) / 2) < 0.01);
  });

  it('normalizes device meta with defaults for lift stations', () => {
    const meta = normalizeDeviceMeta(
      { type: 'lift_simplex', meta: { deviceId: 'ls_1', zoneId: 'zone-a' } },
      { category: 'lift', liftKind: 'simplex' },
    );
    assert.equal(meta.deviceId, 'ls_1');
    assert.equal(meta.zoneId, 'zone-a');
    assert.equal(meta.role, 'collection');
    assert.equal(meta.alarmTag, 'SPX_ALM');
    assert.equal(meta.levelTag, 'SPX_LEVEL');
  });

  it('aggregates zones from meta and Facility Draw groups', () => {
    const placements = [
      { id: 'a', scene: { x: 0, z: 0 }, size: { widthFt: 4, depthFt: 4 }, meta: { zoneId: 'z1' } },
      { id: 'b', scene: { x: 10, z: 0 }, size: { widthFt: 4, depthFt: 4 }, meta: { zoneId: 'z1' } },
      { id: 'c', scene: { x: 30, z: 0 }, size: { widthFt: 4, depthFt: 4 }, meta: {} },
      { id: 'd', scene: { x: 40, z: 0 }, size: { widthFt: 4, depthFt: 4 }, meta: {} },
    ];
    const doc = {
      groups: [{ id: 'grp-east', name: 'East wing', nodeIds: ['c', 'd'] }],
    };
    const zones = aggregateZones(doc, placements);
    assert.equal(zones.length, 2);
    const z1 = zones.find((z) => z.id === 'z1');
    assert.equal(z1.placementIds.length, 2);
    assert.equal(z1.source, 'meta');
    const grp = zones.find((z) => z.id === 'grp-east');
    assert.equal(grp.label, 'East wing');
    assert.equal(grp.source, 'group');
    assert.equal(placements[2].meta.zoneId, 'grp-east');
  });

  it('compiles DWTS sample project', () => {
    const sample = path.join(__dirname, '..', 'data', 'facility-draw', 'projects', 'DWTS.facilitydraw.json');
    if (!fs.existsSync(sample)) return;
    const raw = JSON.parse(fs.readFileSync(sample, 'utf8'));
    const scene = buildSceneFromFacilityDraw(raw);
    assert.ok(scene.placements.length >= 20);
    assert.ok(scene.pipes.length >= 10);
    assert.equal(scene.name, 'dwts');
    const lifts = scene.placements.filter((p) => p.type === 'lift_simplex');
    assert.ok(lifts.length >= 10);
    const typed = scene.placements.filter((p) => p.model3d !== 'box');
    assert.ok(typed.length >= 15);
  });
});

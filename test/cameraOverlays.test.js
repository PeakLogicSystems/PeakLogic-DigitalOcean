'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOverlay,
  normalizeOverlays,
  overlaysForCamera,
  collectSnapshotTriggers,
} = require('../src/cameras/cameraOverlays');

describe('cameraOverlays', () => {
  it('normalizes a bool valve overlay with defaults', () => {
    const o = normalizeOverlay({
      tagId: 'VALVE1_OPEN',
      label: 'Valve 1',
      xPct: 25,
      yPct: 40,
      symbol: 'valve',
    });
    assert.equal(o.tagId, 'VALVE1_OPEN');
    assert.equal(o.xPct, 25);
    assert.equal(o.yPct, 40);
    assert.equal(o.symbol, 'valve');
    assert.equal(o.kind, 'bool');
    assert.equal(o.onColor, '#22c55e');
    assert.equal(o.offColor, '#ef4444');
    assert.equal(o.snapshotOnRising, false);
  });

  it('rejects overlays without tagId', () => {
    assert.equal(normalizeOverlay({ label: 'No tag' }), null);
  });

  it('deduplicates overlay ids', () => {
    const list = normalizeOverlays([
      { id: 'ovl_a', tagId: 'T1', xPct: 10, yPct: 10 },
      { id: 'ovl_a', tagId: 'T2', xPct: 20, yPct: 20 },
    ]);
    assert.equal(list.length, 2);
    assert.notEqual(list[0].id, list[1].id);
  });

  it('reads overlays from camera record', () => {
    const rec = {
      cameraId: 'cam_yard',
      overlays: [{ tagId: 'PUMP_RUN', symbol: 'pump', snapshotOnRising: true }],
    };
    const overlays = overlaysForCamera(rec);
    assert.equal(overlays.length, 1);
    assert.equal(overlays[0].tagId, 'PUMP_RUN');
    assert.equal(overlays[0].symbol, 'pump');
    assert.equal(overlays[0].snapshotOnRising, true);
  });

  it('collects snapshot triggers from all cameras', () => {
    const triggers = collectSnapshotTriggers([
      {
        cameraId: 'cam_a',
        overlays: [
          { id: 'o1', tagId: 'V1', snapshotOnRising: true },
          { id: 'o2', tagId: 'V2', snapshotOnFalling: true },
          { id: 'o3', tagId: 'V3' },
        ],
      },
      { cameraId: 'cam_b', overlays: [{ id: 'o4', tagId: 'V4', snapshotOnRising: true }] },
    ]);
    assert.equal(triggers.length, 3);
    assert.ok(triggers.some((t) => t.cameraId === 'cam_a' && t.tagId === 'V1' && t.snapshotOnRising));
    assert.ok(triggers.some((t) => t.tagId === 'V2' && t.snapshotOnFalling));
  });
});

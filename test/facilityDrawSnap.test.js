'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  nodeBounds,
  boundsOfNodes,
  snapNodeCenter,
  snapPoint,
  alignNodes,
  distributeNodes,
} = require('../facility-draw/src/snapAlign');

const getSymbol = (type) => {
  const sizes = {
    tank: { width: 10, height: 6 },
    small: { width: 4, height: 4 },
  };
  return sizes[type] || { width: 4, height: 4 };
};

describe('facilityDraw snap align', () => {
  it('computes node bounds from symbol size', () => {
    const b = nodeBounds({ type: 'tank', x: 20, y: 10 }, getSymbol);
    assert.equal(b.minX, 15);
    assert.equal(b.maxX, 25);
    assert.equal(b.minY, 7);
    assert.equal(b.maxY, 13);
  });

  it('snaps center to grid', () => {
    const r = snapNodeCenter(
      { type: 'small', x: 0, y: 0 },
      2.3,
      7.6,
      { getSymbol, nodes: [], gridStep: 5, snapGrid: true, snapObjects: false },
    );
    assert.equal(r.x, 0);
    assert.equal(r.y, 10);
  });

  it('snaps to another node edge within threshold', () => {
    const nodes = [
      { id: 'a', type: 'small', x: 0, y: 0 },
      { id: 'b', type: 'small', x: 20, y: 0 },
    ];
    const r = snapNodeCenter(
      { id: 'b', type: 'small', x: 4.2, y: 0 },
      4.2,
      0,
      {
        getSymbol,
        nodes,
        excludeIds: new Set(['b']),
        gridStep: 1,
        snapGrid: false,
        snapObjects: true,
        threshold: 1,
      },
    );
    assert.equal(r.x, 4);
    assert.ok(r.guides.some((g) => g.axis === 'x'));
  });

  it('aligns nodes to shared left edge', () => {
    const nodes = [
      { id: 'a', type: 'small', x: 5, y: 0 },
      { id: 'b', type: 'small', x: 12, y: 0 },
    ];
    const ref = boundsOfNodes(nodes, getSymbol);
    const aligned = alignNodes(nodes, getSymbol, 'left', ref);
    const leftA = nodeBounds(aligned[0], getSymbol).minX;
    const leftB = nodeBounds(aligned[1], getSymbol).minX;
    assert.equal(leftA, leftB);
    assert.equal(leftA, ref.minX);
  });

  it('distributes three nodes evenly on x', () => {
    const nodes = [
      { id: 'a', type: 'small', x: 0, y: 0 },
      { id: 'b', type: 'small', x: 5, y: 0 },
      { id: 'c', type: 'small', x: 20, y: 0 },
    ];
    const out = distributeNodes(nodes, getSymbol, 'x');
    const xs = out.map((n) => n.x).sort((a, b) => a - b);
    assert.equal(xs[1] - xs[0], xs[2] - xs[1]);
  });

  it('snaps arbitrary point to grid', () => {
    const r = snapPoint(2.3, 7.6, {
      getSymbol,
      nodes: [],
      gridStep: 5,
      snapGrid: true,
      snapObjects: false,
    });
    assert.equal(r.x, 0);
    assert.equal(r.y, 10);
  });

  it('snaps point to nearby port', () => {
    const r = snapPoint(10.4, 0.2, {
      getSymbol,
      nodes: [],
      snapGrid: false,
      snapObjects: false,
      threshold: 1,
      portPoints: [{ x: 10, y: 0 }],
    });
    assert.equal(r.x, 10);
    assert.equal(r.y, 0);
  });
});

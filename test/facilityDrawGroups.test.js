'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGroup,
  expandNodeIdsWithGroups,
  ungroupNodes,
  removeNodesFromGroups,
  nodesInWorldRect,
} = require('../facility-draw/src/groups');

describe('facilityDraw groups', () => {
  const getSymbol = (type) => ({ width: 4, height: 4 });

  it('creates and expands group membership', () => {
    const groups = createGroup([], ['n1', 'n2', 'n3'], 'group_1', 'Pump skid');
    assert.equal(groups.length, 1);
    assert.deepEqual(expandNodeIdsWithGroups(groups, ['n2']), ['n1', 'n2', 'n3']);
  });

  it('ungroups touched groups', () => {
    const groups = createGroup([], ['a', 'b'], 'g1');
    const next = ungroupNodes(groups, ['a']);
    assert.equal(next.length, 0);
  });

  it('removes deleted nodes from groups and drops small groups', () => {
    const groups = createGroup([], ['a', 'b', 'c'], 'g1');
    const next = removeNodesFromGroups(groups, ['c']);
    assert.equal(next.length, 1);
    assert.deepEqual(next[0].nodeIds, ['a', 'b']);
    const gone = removeNodesFromGroups(next, ['b']);
    assert.equal(gone.length, 0);
  });

  it('finds nodes intersecting marquee rect', () => {
    const nodes = [
      { id: 'n1', type: 'd_box', x: 0, y: 0 },
      { id: 'n2', type: 'd_box', x: 20, y: 0 },
    ];
    const hits = nodesInWorldRect(nodes, { minX: -5, maxX: 5, minY: -5, maxY: 5 }, getSymbol);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'n1');
  });
});

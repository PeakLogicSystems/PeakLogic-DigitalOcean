'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normalizePens, penTagIds, MAX_GRAPH_PENS } = require('../src/graph/graphPens');

describe('graphPens', () => {
  const tags = [
    { id: 'AI1', type: 'INT' },
    { id: 'AI2', type: 'REAL' },
    { id: 'DI1', type: 'BOOL' },
    { id: 'X', type: 'STRING' },
  ];

  it('caps at 32 pens', () => {
    const pens = Array.from({ length: 40 }, (_, i) => ({ tagId: 'AI1', color: '#000000' }));
    assert.equal(normalizePens(pens, tags).length, 1);
  });

  it('allows BOOL and drops invalid types', () => {
    const pens = normalizePens([
      { tagId: 'X', color: '#000000' },
      { tagId: 'DI1', color: '#111111' },
      { tagId: 'AI1', color: '#222222' },
      { tagId: 'AI1', color: '#333333' },
      { tagId: 'AI2', color: '#444444' },
    ], tags);
    assert.deepEqual(penTagIds(pens), ['DI1', 'AI1', 'AI2']);
  });

  it('applies defaults for scale and color', () => {
    const [p] = normalizePens([{ tagId: 'AI1' }], tags);
    assert.equal(p.scale, 1);
    assert.match(p.color, /^#[0-9a-f]{6}$/i);
    assert.equal(MAX_GRAPH_PENS, 32);
  });
});

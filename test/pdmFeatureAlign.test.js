'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  alignPdmFeatures,
  resolveTagIdsForAsset,
  healthIndexFromEdge,
} = require('../src/pdm/featureAlign');

describe('pdm feature alignment', () => {
  it('resolves tagIds from assetTags map', () => {
    const tags = resolveTagIdsForAsset('pump-101', {
      assetTags: { 'pump-101': ['AI1', 'AI2'] },
    });
    assert.deepEqual(tags, ['AI1', 'AI2']);
  });

  it('prefers explicit tagIds over asset map', () => {
    const tags = resolveTagIdsForAsset('pump-101', {
      tagIds: ['T1'],
      assetTags: { 'pump-101': ['AI1'] },
    });
    assert.deepEqual(tags, ['T1']);
  });

  it('aligns scada and edge into windows', () => {
    const fromMs = Date.parse('2026-06-01T00:00:00Z');
    const toMs = fromMs + 2 * 60 * 60 * 1000;
    const aligned = alignPdmFeatures({
      fromMs,
      toMs,
      assetId: 'pump-101',
      windowMin: 60,
      penDocs: [
        {
          at: new Date(fromMs + 10 * 60 * 1000),
          pen: { tagId: 'AI1' },
          sampleValue: 40,
        },
        {
          at: new Date(fromMs + 20 * 60 * 1000),
          pen: { tagId: 'AI1' },
          sampleValue: 60,
        },
      ],
      edgeDocs: [
        {
          at: new Date(fromMs + 15 * 60 * 1000),
          assetId: 'pump-101',
          modelId: 'vib-v1',
          inference: { type: 'anomaly', score: 0.8, label: 'wear' },
        },
      ],
    });
    assert.equal(aligned.features.length, 2);
    assert.equal(aligned.features[0].scada.tagStats.AI1.count, 2);
    assert.equal(aligned.features[0].edge.maxScore, 0.8);
    assert.equal(aligned.features[0].healthIndex, 0.2);
  });

  it('computes health index from edge max score', () => {
    assert.equal(healthIndexFromEdge({ maxScore: 0.87 }), 0.13);
    assert.equal(healthIndexFromEdge({ maxScore: null }), null);
  });
});

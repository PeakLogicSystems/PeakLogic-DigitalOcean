'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { estimateRulFromFeatures, featuresToChartHistory } = require('../src/pdm/rulEstimate');

describe('rulEstimate', () => {
  it('estimates degrading RUL from health index trend', () => {
    const base = Date.parse('2026-06-01T00:00:00Z');
    const features = [];
    for (let i = 0; i < 10; i++) {
      features.push({
        windowStartMs: base + i * 24 * 60 * 60 * 1000,
        healthIndex: 0.9 - i * 0.05,
        edge: { maxScore: 0.1 + i * 0.05 },
        scada: { tagStats: {} },
      });
    }
    const rul = estimateRulFromFeatures(features, { failureThreshold: 0.3 });
    assert.equal(rul.ok, true);
    assert.equal(rul.trend, 'degrading');
    assert.ok(rul.rulDaysEstimate > 0);
  });

  it('builds chart history from features', () => {
    const hist = featuresToChartHistory([
      {
        windowStartMs: 1000,
        healthIndex: 0.8,
        edge: { maxScore: 0.2 },
        scada: { tagStats: { AI1: { avg: 42 } } },
      },
    ]);
    assert.equal(hist.HEALTH_IDX.length, 1);
    assert.equal(hist.EDGE_SCORE.length, 1);
    assert.equal(hist.AI1[0].value, 42);
  });
});

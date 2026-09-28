'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  normalizeEdgeInference,
  extractEdgePayloads,
} = require('../src/logger/mongoTagLogger');

describe('mongo edge inference', () => {
  it('normalizes edgeAi object on telemetry body', () => {
    const docs = extractEdgePayloads({
      deviceId: 'gateway-07',
      edgeAi: {
        modelId: 'vib-anomaly-v3',
        assetId: 'pump-101',
        type: 'anomaly',
        score: 0.87,
        label: 'bearing_wear',
        confidence: 0.92,
        features: { rms: 2.1 },
      },
    });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].deviceId, 'gateway-07');
    assert.equal(docs[0].assetId, 'pump-101');
    assert.equal(docs[0].modelId, 'vib-anomaly-v3');
    assert.equal(docs[0].inference.score, 0.87);
    assert.equal(docs[0].features.rms, 2.1);
  });

  it('supports inference array payloads', () => {
    const docs = extractEdgePayloads({
      deviceId: 'edge-01',
      edgeAi: [
        { modelId: 'm1', score: 0.2, label: 'ok' },
        { modelId: 'm2', score: 0.9, label: 'fault' },
      ],
    });
    assert.equal(docs.length, 2);
    assert.equal(docs[1].inference.label, 'fault');
  });

  it('rejects empty inference payloads', () => {
    assert.equal(normalizeEdgeInference({}), null);
    assert.equal(extractEdgePayloads({ deviceId: 'x', tags: [] }).length, 0);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { FEATURE_DIM, mcsaToFeatureVector, channelMetrics } = require('../src/inference/mcsaFeatures');
const { inferRule, classifyPumpStart } = require('../src/inference/ruleClassifier');
const { resolveInferenceTargets } = require('../src/inference/modelRegistry');
const { shouldRunHost, runHostInferenceFromReport } = require('../src/inference/hostInference');
const { expandMcsaEnvTags } = require('../src/parc/mcsaTelemetry');

const FIXTURES = path.join(__dirname, '..', 'st', 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

const hostSettings = {
  inference: {
    hostEnabled: true,
    mode: 'host-supplement',
    backend: 'rule',
  },
};

describe('mcsa feature vector', () => {
  it('builds fixed-length vector from cooked spectra', () => {
    const sample = loadFixture('opta-mcsa-lite-telemetry-sample.json');
    const vec = mcsaToFeatureVector(sample.mcsa);
    assert.equal(vec.length, FEATURE_DIM);
    assert.ok(vec[0] > 0);
  });

  it('handles HVAC mcsa channels', () => {
    const sample = loadFixture('hvac-mcsa-telemetry-sample.json');
    const m = channelMetrics(sample.mcsa[0]);
    assert.ok(m.fund > 0);
    assert.ok(m.ratioSide >= 0);
  });
});

describe('model registry targets', () => {
  it('maps Opta MCSA to pump assets', () => {
    const sample = loadFixture('opta-mcsa-lite-telemetry-sample.json');
    const targets = resolveInferenceTargets(sample);
    assert.ok(targets.some((t) => t.assetId === 'pump-1'));
    assert.equal(targets.find((t) => t.assetId === 'pump-1')?.modelId, 'lift-submersible-v3');
  });

  it('maps HVAC MCSA to comp and fan assets', () => {
    const sample = loadFixture('hvac-mcsa-telemetry-sample.json');
    const targets = resolveInferenceTargets(sample);
    assert.deepEqual(
      targets.map((t) => t.assetId).sort(),
      ['comp-fl1', 'fan-fl1'],
    );
  });
});

describe('host inference orchestration', () => {
  it('skips supplement mode when device edgeAi is present', () => {
    const sample = loadFixture('opta-mcsa-lite-telemetry-sample.json');
    assert.equal(shouldRunHost(sample, hostSettings.inference), false);
  });

  it('runs for HVAC telemetry without edgeAi', () => {
    const sample = loadFixture('hvac-mcsa-telemetry-sample.json');
    assert.equal(shouldRunHost(sample, hostSettings.inference), true);
  });

  it('scores HVAC report into edge_inference docs', async () => {
    const sample = expandMcsaEnvTags(loadFixture('hvac-mcsa-telemetry-sample.json'));
    const result = await runHostInferenceFromReport(sample, { settings: hostSettings });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    assert.equal(result.count, 2);
    const comp = result.docs.find((d) => d.assetId === 'comp-fl1');
    assert.ok(comp);
    assert.equal(comp.source, 'host');
    assert.equal(comp.inference.type, 'anomaly');
    assert.ok(comp.inference.label);
    assert.ok(comp.features.hostBackend === 'rule');
  });

  it('scores Opta when edgeAi omitted', async () => {
    const sample = loadFixture('opta-mcsa-lite-telemetry-sample.json');
    delete sample.edgeAi;
    const result = await runHostInferenceFromReport(sample, { settings: hostSettings });
    assert.ok(result.docs.length >= 1);
    assert.ok(result.docs.some((d) => d.assetId === 'pump-1'));
  });
});

describe('rule classifier', () => {
  it('matches Opta start-time thresholds', () => {
    const r = classifyPumpStart({ startMs: 5200, runAmps: 10, baselineAmps: 8 });
    assert.equal(r.label, 'impeller_worn');
    assert.ok(r.score > 0.8);
  });
});

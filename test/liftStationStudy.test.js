'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  STUDY_SCENARIOS,
  studyAssetId,
  allStudyAssetIds,
  buildStudySettings,
  generateScenarioSim,
} = require('../src/pdm/liftStationStudy');
const { applyProductionEarlyWarningProfile } = require('../src/settings/pdmProductionProfile');
const { duplexTrueMcsaFromStart } = require('../src/pdm/liftStationMcsaSim');

describe('lift station 4-way study', () => {
  it('matches user matrix: opta regression, opta onnx, true mcsa rule, true mcsa onnx', () => {
    assert.deepEqual(STUDY_SCENARIOS.map((s) => s.id), [
      'opta-mcsa-regression',
      'opta-mcsa-onnx',
      'true-mcsa-regression',
      'true-mcsa-onnx',
    ]);
    assert.equal(STUDY_SCENARIOS[0].hostInference, false);
    assert.equal(STUDY_SCENARIOS[1].hostInference, 'onnx');
    assert.equal(STUDY_SCENARIOS[2].hostInference, 'rule');
    assert.equal(STUDY_SCENARIOS[3].hostInference, 'onnx');
  });

  it('registers 8 study assets plus live pump-1/pump-2', () => {
    const settings = buildStudySettings({ days: 180 });
    assert.equal(allStudyAssetIds().length, 8);
    assert.ok(settings.pdm.assetContext['pump-1-opta-mcsa-onnx']);
    assert.ok(settings.pdm.assetContext['pump-1']);
    assert.equal(settings.pdm.forecastMethods.length, 3);
  });

  it('production early-warning profile enables host supplement + CMMS', () => {
    const s = applyProductionEarlyWarningProfile({});
    assert.equal(s.inference.hostEnabled, true);
    assert.equal(s.inference.mode, 'host-supplement');
    assert.equal(s.cmms.autoWorkOrdersFromPdm, true);
  });

  it('true MCSA sim has bearing bins and fft metadata', () => {
    const ch = duplexTrueMcsaFromStart({ pumpIndex: 1, runAmps: 10, healthScore: 0.4, wear: 0.5 })[0];
    assert.ok(ch.bearing);
    assert.ok(ch.ecc);
  });

  it('regression scenario has no edge docs in sim', () => {
    const sim = generateScenarioSim({
      scenarioId: 'opta-mcsa-regression',
      days: 90,
      projectName: 'test',
    });
    assert.equal(sim.edgeDocs.length, 0);
    assert.ok(sim.startEvents.length > 50);
  });
});

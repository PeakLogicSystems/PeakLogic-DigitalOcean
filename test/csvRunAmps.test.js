'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  analyzeCsvFile,
  analyzeCsvFiles,
  classifyByInrush,
  writeTrainingArtifacts,
} = require('../src/pdm/csvRunAmps');

const SAMPLE = `datelogged,High Level FLoat,Lag Float,Lead Float,OFF Float,MS 1 Run,MS 1 Fault,MS 2 Run,MS 2 Fault,MS 3 Run,MS 3 Fault,Generator Fault,Phase Loss,Generator Fuel Fault,Power Fail,Motor 1 Phase A CT,Motor 1 Phase B CT,Motor 2 Phase C CT,Output 7,Motor 1 Starts,Motor 1 Run Time,Motor 2 Starts,Motor 2 Run Time
2026-07-21 10:00:00,Off,Off,Off,Off,Off,Off,1,On,0,0,0,Off,1,1.53,0.01,0.01,0.01,0,0,0,0,0
2026-07-21 10:05:00,Off,Off,Off,Off,Off,Off,1,Off,0,0,0,Off,1,1.53,15.0,0.01,0.01,0,1,5,0,0
2026-07-21 10:10:00,Off,Off,Off,Off,Off,Off,1,Off,0,0,0,Off,1,1.53,14.5,0.01,0.01,0,1,10,0,0
2026-07-21 10:15:00,Off,Off,Off,Off,Off,Off,1,Off,0,0,0,Off,1,1.53,14.2,0.01,0.01,0,1,15,0,0
2026-07-21 10:20:00,Off,Off,Off,Off,Off,Off,1,On,0,0,0,Off,1,1.53,0.02,0.01,0.01,0,1,20,0,0
`;

describe('csvRunAmps', () => {
  it('classifies high inrush as capacitor issues', () => {
    assert.equal(classifyByInrush(1.1).label, 'healthy');
    assert.equal(classifyByInrush(1.4).label, 'healthy');
    assert.equal(classifyByInrush(1.8).label, 'capacitor_weak');
    assert.equal(classifyByInrush(2.5).label, 'capacitor_failed');
  });

  it('discovers inverted MS 2 Fault → Phase A correlation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-run-amps-'));
    const file = path.join(dir, 'sample.csv');
    fs.writeFileSync(file, SAMPLE);
    const result = analyzeCsvFile(file, { ampThreshold: 2 });
    assert.equal(result.correlation.digital, 'MS 2 Fault');
    assert.equal(result.correlation.ct, 'Motor 1 Phase A CT');
    assert.equal(result.correlation.inverted, true);
    assert.ok(result.correlation.delta > 10);
    assert.equal(result.runCount, 1);
    assert.ok(result.training[0].features.runCurrentA > 10);
    assert.ok(result.training[0].features.peakStartCurrentA >= result.training[0].features.runCurrentA);
  });

  it('writes training artifacts for multiple files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-run-amps-'));
    const f1 = path.join(dir, 'site-a.csv');
    fs.writeFileSync(f1, SAMPLE);
    const analyzed = analyzeCsvFiles([f1]);
    const out = path.join(dir, 'out');
    const arts = writeTrainingArtifacts(analyzed, out);
    assert.ok(fs.existsSync(arts.trainCsvPath));
    assert.ok(fs.existsSync(arts.reportPath));
    const csv = fs.readFileSync(arts.trainCsvPath, 'utf8');
    assert.ok(csv.includes('peakStartCurrentA'));
    assert.ok(csv.includes('putnam-site-a'));
  });
});

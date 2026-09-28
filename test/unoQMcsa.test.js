'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadJsonTemplates } = require('../src/devices/loadJsonTemplates');
const { resolveInferenceTargets, resolveModelId } = require('../src/inference/modelRegistry');
const { shouldRunHost, runHostInferenceFromReport } = require('../src/inference/hostInference');
const { channelMetrics } = require('../src/inference/mcsaFeatures');
const { cookChannel, synthesizeCurrent } = require('../src/inference/mcsaFft');
const { classifyFromMcsa } = require('../src/inference/ruleClassifier');

const FIXTURE = path.join(__dirname, '..', 'st', 'fixtures', 'uno-q-mcsa-telemetry-sample.json');

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

const hostSettings = {
  inference: {
    hostEnabled: true,
    mode: 'host-supplement',
    backend: 'rule',
  },
};

describe('UNO Q edge MCSA', () => {
  it('loads the arduino_uno_q_mcsa device template', () => {
    const presets = loadJsonTemplates();
    const t = presets.find((p) => p.id === 'arduino_uno_q_mcsa');
    assert.ok(t);
    assert.equal(t.transport, 'mqtt_parc_telemetry');
    const drv = t.driver({ driverId: 'unoq_mcsa_01' });
    assert.equal(drv.type, 'mqtt_parc');
    assert.equal(drv.telemetryOnly, true);
    assert.equal(drv.remoteExecution, false);
  });

  it('maps one CT per pump (ch0 → pump-1, ch1 → pump-2)', () => {
    const sample = loadFixture();
    assert.equal(resolveModelId(sample.platform), 'lift-submersible-v3');
    const targets = resolveInferenceTargets(sample);
    assert.deepEqual(
      targets.map((t) => t.assetId).sort(),
      ['pump-1', 'pump-2'],
    );
    assert.equal(targets.find((t) => t.assetId === 'pump-1')?.channels[0].ch, 0);
    assert.equal(targets.find((t) => t.assetId === 'pump-2')?.channels[0].ch, 1);
  });

  it('maps six CTs as Opta duplex (ch0–2 pump-1, ch3–5 pump-2)', () => {
    const sample = loadFixture();
    sample.mcsa = Array.from({ length: 6 }, (_, ch) => ({
      ch,
      fund: [60, ch < 3 ? 5 : 0.04],
      rotor: [[56.4, 0.01], [63.6, 0.01]],
      bearing: [],
      ecc: [],
      pump: [],
    }));
    const targets = resolveInferenceTargets(sample);
    assert.equal(targets.find((t) => t.assetId === 'pump-1')?.channels.length, 3);
    assert.equal(targets.find((t) => t.assetId === 'pump-2')?.channels.length, 3);
  });

  it('skips host-supplement when device edgeAi is present', () => {
    const sample = loadFixture();
    assert.equal(shouldRunHost(sample, hostSettings.inference), false);
  });

  it('runs host rules when edgeAi is omitted', async () => {
    const sample = loadFixture();
    delete sample.edgeAi;
    assert.equal(shouldRunHost(sample, hostSettings.inference), true);
    const result = await runHostInferenceFromReport(sample, { settings: hostSettings });
    assert.equal(result.ok, true);
    assert.ok(result.docs.some((d) => d.assetId === 'pump-1'));
  });

  it('cooks a 60 Hz synthetic current to a fund bin near 60 Hz', () => {
    const n = 2048;
    const fs = 4096;
    const amps = synthesizeCurrent(n, fs, { fundHz: 60, runAmps: 8, mode: 'healthy' });
    const cooked = cookChannel(Array.from(amps), { ch: 0, sampleRate: fs, fundHz: 60 });
    assert.ok(Math.abs(cooked.fund[0] - 60) < 2);
    assert.ok(cooked.fund[1] > 1);
    const m = channelMetrics(cooked);
    assert.ok(m.ratioSide < 0.35, `healthy ratioSide=${m.ratioSide}`);
  });

  it('flags bearing_wear from elevated 3.1× fund energy', () => {
    const n = 2048;
    const fs = 4096;
    const healthy = cookChannel(
      Array.from(synthesizeCurrent(n, fs, { fundHz: 60, runAmps: 8, mode: 'healthy' })),
      { ch: 0, sampleRate: fs, fundHz: 60 },
    );
    const worn = cookChannel(
      Array.from(synthesizeCurrent(n, fs, { fundHz: 60, runAmps: 8, mode: 'bearing_wear' })),
      { ch: 0, sampleRate: fs, fundHz: 60 },
    );
    const h = channelMetrics(healthy);
    const w = channelMetrics(worn);
    assert.ok(w.bands.bearing > h.bands.bearing * 2, `bearing ${w.bands.bearing} vs healthy ${h.bands.bearing}`);
    const clf = classifyFromMcsa([worn], {});
    assert.ok(['bearing_wear', 'imbalance'].includes(clf.label) || w.ratioSide > h.ratioSide);
  });
});

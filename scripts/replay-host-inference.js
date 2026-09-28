#!/usr/bin/env node
'use strict';

/**
 * Replay Parc telemetry fixtures through host MCSA inference (no MQTT broker required).
 *
 * Usage:
 *   node scripts/replay-host-inference.js
 *   node scripts/replay-host-inference.js st/fixtures/hvac-mcsa-telemetry-sample.json
 */

const fs = require('fs');
const path = require('path');
const { runHostInferenceFromReport } = require('../src/inference/hostInference');
const { expandMcsaEnvTags } = require('../src/parc/mcsaTelemetry');

const ROOT = path.join(__dirname, '..');
const defaultFixtures = [
  'st/fixtures/hvac-mcsa-telemetry-sample.json',
  'st/fixtures/opta-mcsa-lite-telemetry-sample.json',
];

const settings = {
  inference: {
    hostEnabled: true,
    mode: process.argv.includes('--override') ? 'host-override' : 'host-supplement',
    backend: process.argv.includes('--onnx') ? 'auto' : 'rule',
  },
};

async function replay(file) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const body = expandMcsaEnvTags(JSON.parse(fs.readFileSync(abs, 'utf8')));
  const result = await runHostInferenceFromReport(body, { settings });
  console.log(`\n=== ${path.basename(file)} ===`);
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const files = args.length ? args : defaultFixtures;
  for (const file of files) {
    await replay(file);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

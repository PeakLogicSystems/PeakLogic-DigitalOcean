#!/usr/bin/env node
'use strict';

/**
 * Copy normalized HMI from data/projects/putnam-county.est.json into data/settings.json.
 * Use after generate:putnam-fleet when the live workspace HMI is stale (screen 1 fleet map, missing lifts).
 */

const fs = require('fs');
const path = require('path');
const { normalizeHmi } = require('../src/hmi/hmiConfig');

const ROOT = path.join(__dirname, '..');
const EST_PATH = path.join(ROOT, 'data', 'projects', 'putnam-county.est.json');
const SETTINGS_PATH = path.join(ROOT, 'data', 'settings.json');
const PUBLIC_ROOT = path.join(ROOT, 'public');

function main() {
  if (!fs.existsSync(EST_PATH)) {
    console.error('Missing project file:', EST_PATH);
    console.error('Run: npm run generate:putnam-fleet');
    process.exit(1);
  }
  if (!fs.existsSync(SETTINGS_PATH)) {
    console.error('Missing settings file:', SETTINGS_PATH);
    process.exit(1);
  }

  const est = JSON.parse(fs.readFileSync(EST_PATH, 'utf8'));
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  const srcHmi = est.settings?.hmi;
  if (!srcHmi?.screens?.length) {
    console.error('putnam-county.est.json has no HMI screens');
    process.exit(1);
  }

  const hmi = normalizeHmi(srcHmi, settings.tags || est.tags || [], PUBLIC_ROOT);
  settings.hmi = hmi;
  settings.project = { ...(settings.project || {}), name: 'putnam-county' };
  settings.activeScreen = hmi.activeScreen || 'screen_1';

  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

  const s1 = hmi.screens.find((s) => s.number === 1);
  const s6 = hmi.screens.find((s) => s.number === 6);
  console.log('Synced Putnam HMI into data/settings.json');
  console.log(`  screens: ${hmi.screens.length}`);
  console.log(`  composer: ${hmi.layout?.composerMode}`);
  console.log(`  screen 1: ${s1?.facility3dUrl || hmi.layout?.facility3dUrl || '(none)'}`);
  console.log(`  screen 6: ${s6?.facility3dUrl || '(none)'}`);
  console.log(`  lift screens: ${hmi.screens.filter((s) => s.number >= 7).length}`);
}

main();

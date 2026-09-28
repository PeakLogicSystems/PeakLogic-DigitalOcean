'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  OPERATOR,
  INSTALLED_BASE_ESTIMATE,
  LIFT_STATIONS,
  buildPdmBlock,
  fleetManifest,
  fleetCsvLines,
  pdmTagsForPump,
} = require('../scripts/ace-fleet/fleet-data');

const ROOT = path.resolve(__dirname, '..');

describe('ACE LiftPoint fleet configuration', () => {
  it('defines operator and sample LiftPoint Light sites', () => {
    assert.equal(OPERATOR.slug, 'ace-septic-waste');
    assert.ok(INSTALLED_BASE_ESTIMATE >= 2000);
    assert.equal(LIFT_STATIONS.length, 8);
    assert.ok(LIFT_STATIONS.every((s) => s.liftProfile === 'liftpoint_light'));
    assert.ok(LIFT_STATIONS.every((s) => s.templateId === 'lift_station_epi'));
  });

  it('mixes CT-equipped and starts-only sites', () => {
    const ct = LIFT_STATIONS.filter((s) => s.hasCt);
    const startsOnly = LIFT_STATIONS.filter((s) => !s.hasCt);
    assert.equal(ct.length, 4);
    assert.equal(startsOnly.length, 4);
    const salvation = LIFT_STATIONS.find((s) => s.slug === 'salvation-army-us41');
    assert.equal(salvation.serialNum, '862406071948166');
    assert.equal(salvation.hasCt, true);
  });

  it('builds PdM asset tags with starts counters for all pumps', () => {
    const pdm = buildPdmBlock();
    assert.ok(pdm.forecastMethods.includes('starts_analytics'));
    assert.ok(pdm.forecastMethods.includes('run_amps_creep'));
    const ctSite = LIFT_STATIONS.find((s) => s.hasCt);
    const noCtSite = LIFT_STATIONS.find((s) => !s.hasCt);
    const ctTags = pdmTagsForPump(ctSite, 1);
    const noCtTags = pdmTagsForPump(noCtSite, 1);
    assert.ok(ctTags.some((t) => t.endsWith('_P1_STARTS')));
    assert.ok(ctTags.some((t) => t.endsWith('_AI1')));
    assert.ok(!noCtTags.some((t) => t.endsWith('_AI1')));
    assert.ok(pdm.assetTags[`${ctSite.slug}-pump-1`].includes(`${ctSite.tagPrefix}_AI1`));
  });

  it('CSV supports bulk import with has_ct column', () => {
    const lines = fleetCsvLines();
    assert.equal(lines.length, 9);
    assert.match(lines[0], /has_ct/);
    assert.match(lines[0], /serial_num/);
    assert.match(lines[1], /salvation-army-us41/);
    assert.match(lines[1], /862406071948166/);
  });

  it('fleet manifest documents PdM tiers', () => {
    const m = fleetManifest();
    assert.equal(m.cloudProject, 'ace-liftpoint-fleet');
    assert.equal(m.operator.slug, OPERATOR.slug);
    assert.equal(m.liftStations.length, 8);
    assert.equal(m.pdm.mode, 'starts_analytics');
  });

  it('generated artifacts exist after generate-artifacts', () => {
    const files = [
      'st/fixtures/fleet_ace_liftpoint.json',
      'st/fixtures/fleet_import_ace.csv',
      'data/projects/ace-liftpoint-fleet.est.json',
      'st/logic/ace_fleet_rollup.st',
      'deploy/cloud/.env.ace.example',
    ];
    for (const rel of files) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    }
  });

  it('cloud est has mqtt drivers and PdM starts_analytics settings', () => {
    const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/ace-liftpoint-fleet.est.json'), 'utf8'));
    const mqtt = est.drivers.filter((d) => d.type === 'mqtt');
    assert.equal(mqtt.length, 8);
    assert.ok(mqtt.every((d) => d.templateId === 'lift_station_epi'));
    assert.ok(mqtt.every((d) => d.serialNum));
    assert.equal(est.settings.aceFleet.operator.slug, OPERATOR.slug);
    assert.ok(est.settings.pdm.forecastMethods.includes('starts_analytics'));
    assert.ok(est.tags.some((t) => t.id.endsWith('_P1_STARTS')));
    assert.ok(est.tags.some((t) => t.id === 'ACE_FLEET_ANY_ALM'));
  });
});

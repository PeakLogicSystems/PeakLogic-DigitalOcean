'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  STARTER,
  FLEET,
  OPERATOR,
  INSTALLED_BASE_ESTIMATE,
  FLEET_TOTAL_STORES,
  FLEET_MONITORED_STORES,
  LIFT_STATIONS,
  buildPdmBlock,
  starterManifest,
  sampleFleetManifest,
  fleetFleetManifest,
  fleetCsvLines,
  generateFloridaFleet,
  pdmTagsForPump,
} = require('../scripts/circlek-fleet/fleet-data');

const ROOT = path.resolve(__dirname, '..');

describe('C-store Opta Parc cloud fleet configuration', () => {
  it('defines starter template and Circle K reference operator', () => {
    assert.equal(STARTER.projectId, 'cstore-opta-parc-starter');
    assert.equal(FLEET.projectId, 'circle-k-florida-fleet');
    assert.equal(OPERATOR.slug, 'circle-k-florida');
    assert.ok(INSTALLED_BASE_ESTIMATE >= 500);
    assert.equal(FLEET_TOTAL_STORES, 500);
    assert.equal(FLEET_MONITORED_STORES, 400);
    assert.equal(LIFT_STATIONS.length, 12);
  });

  it('starter manifest is empty and incremental', () => {
    const m = starterManifest();
    assert.equal(m.mode, 'incremental');
    assert.equal(m.starterProject, 'cstore-opta-parc-starter');
    assert.equal(m.liftStations.length, 0);
    assert.equal(m.bridgeMode, 'opta_parc_direct');
    assert.match(m.onboardingDoc, /CSTORE_OPTA_PARC_CLOUD/);
  });

  it('sample manifest holds Circle K demo sites only', () => {
    const m = sampleFleetManifest();
    assert.equal(m.cloudProject, 'circle-k-florida-demo');
    assert.equal(m.liftStations.length, 12);
  });

  it('generates 500-store Florida fleet with 400 monitored', () => {
    const fleet = generateFloridaFleet();
    assert.equal(fleet.length, 500);
    const monitored = fleet.filter((s) => s.monitored !== false);
    const unmonitored = fleet.filter((s) => s.monitored === false);
    assert.equal(monitored.length, 400);
    assert.equal(unmonitored.length, 100);
    assert.equal(monitored.filter((s) => s.monitorType === 'lift').length, 280);
    assert.equal(monitored.filter((s) => s.monitorType === 'septic').length, 120);
    assert.ok(monitored.every((s) => s.tagPrefix && s.tagPrefix.startsWith('CK')));
    assert.ok(unmonitored.every((s) => !s.driverId && !s.tagPrefix));
    assert.ok(monitored.every((s) => s.phase === 1 && s.iotLinkPhase2 === true));
  });

  it('fleet manifest summarizes rollout and store mix', () => {
    const fleet = generateFloridaFleet();
    const m = fleetFleetManifest(fleet);
    assert.equal(m.cloudProject, 'circle-k-florida-fleet');
    assert.equal(m.monitoredStores, 400);
    assert.equal(m.unmonitoredStores, 100);
    assert.equal(m.liftCount, 280);
    assert.equal(m.septicCount, 120);
    assert.equal(m.allStores.length, 500);
    assert.match(m.rollout.phase2, /IoT-Link/i);
  });

  it('builds PdM asset tags with CT amps for Opta pumps', () => {
    const pdm = buildPdmBlock();
    assert.ok(pdm.forecastMethods.includes('mcsa_onnx'));
    const site = LIFT_STATIONS[0];
    assert.ok(pdmTagsForPump(site, 1).some((t) => t.endsWith('_AI1')));
    const fleetPdm = buildPdmBlock(generateFloridaFleet().filter((s) => s.monitored !== false));
    assert.equal(Object.keys(fleetPdm.assetTags).length, 680);
  });

  it('CSV supports bulk import with monitor columns', () => {
    const lines = fleetCsvLines();
    assert.equal(lines.length, 13);
    assert.match(lines[0], /device_id/);
    assert.match(lines[0], /monitor_type/);
    assert.match(lines[1], /mv_ck_tampa_fowler_01/);
    const fleetCsv = fleetCsvLines(generateFloridaFleet());
    assert.equal(fleetCsv.length, 501);
    assert.match(fleetCsv[1], /,1,lift,dual_duplex,/);
  });

  it('generated starter artifacts exist', () => {
    const files = [
      'st/fixtures/cstore_opta_parc_starter.json',
      'st/fixtures/fleet_circle_k_florida.json',
      'st/fixtures/fleet_import_circle_k.csv',
      'data/projects/cstore-opta-parc-starter.est.json',
      'st/logic/cstore_opta_parc_fleet_rollup.st',
      'deploy/cloud/.env.cstore-opta-parc.example',
      'public/samples/cstore-opta-parc-fleet-3d.html',
      'docs/CSTORE_OPTA_PARC_CLOUD.md',
    ];
    for (const rel of files) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    }
  });

  it('starter est project has no drivers and mqttParc enabled', () => {
    const est = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'data/projects/cstore-opta-parc-starter.est.json'),
      'utf8',
    ));
    assert.equal(est.project.name, 'cstore-opta-parc-starter');
    assert.equal(est.drivers.length, 0);
    assert.equal(est.settings.mqttParc.enabled, true);
    assert.equal(est.settings.cstoreOptaParc.mode, 'incremental');
    const fleet3d = est.settings.hmi.screens.find((s) => /cstore-opta-parc-fleet-3d/.test(s.facility3dUrl || ''));
    assert.ok(fleet3d);
  });
});

describe('Circle K Florida 500-store fleet project', () => {
  it('generated fleet artifacts exist after --fleet build', () => {
    const files = [
      'st/fixtures/fleet_circle_k_florida_500.json',
      'st/fixtures/fleet_import_circle_k_500.csv',
      'data/projects/circle-k-florida-fleet.est.json',
      'st/logic/circle_k_florida_fleet_rollup.st',
      'public/samples/circle-k-florida-fleet-3d.html',
    ];
    for (const rel of files) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel} — run npm run generate:circlek-fleet -- --fleet`);
    }
  });

  it('fleet est project has 400 drivers and Putnam-style DUPLEXLS faceplates', () => {
    const est = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'data/projects/circle-k-florida-fleet.est.json'),
      'utf8',
    ));
    assert.equal(est.project.name, 'circle-k-florida-fleet');
    assert.equal(est.drivers.length, 400);
    assert.equal(est.settings.hmi.screens.length, 401);
    assert.match(est.settings.hmi.screens[0].facility3dUrl || '', /circle-k-florida-fleet-3d/);
    assert.match(est.settings.hmi.screens[1].name || '', /DUPLEXLS/);
    assert.equal(est.settings.hmi.screens[1].tiles[0].compositeId, 'duplexls');
    assert.ok(est.settings.hmi.bindings.length > 400);
    assert.equal(est.settings.circlekFloridaFleet.monitoredStores, 400);
    assert.equal(est.settings.circlekFloridaFleet.allStores.length, 500);
  });
});

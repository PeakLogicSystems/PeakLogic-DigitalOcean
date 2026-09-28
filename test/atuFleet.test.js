'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  TENANT,
  STATION_TYPES,
  SIZING_GUIDE,
  RESIDENTIAL_DEVICES,
  COMMERCIAL_DEVICES,
  DWTS_DEVICES,
  DWTS_TANK_GUIDE,
  SITE_PROFILES,
  stationTypeMeta,
  profileManifest,
  profilesCatalog,
  fleetCsvLines,
} = require('../scripts/atu-fleet/fleet-data');

const ROOT = path.resolve(__dirname, '..');

describe('ATU cloud fleet configuration', () => {
  it('defines ATU and lift station types', () => {
    assert.ok(STATION_TYPES.single_atu);
    assert.ok(STATION_TYPES.dual_atu);
    assert.ok(STATION_TYPES.quad_atu);
    assert.ok(STATION_TYPES.simplex);
    assert.equal(STATION_TYPES.single_atu.trains, 1);
    assert.equal(STATION_TYPES.quad_atu.trains, 4);
  });

  it('residential profile is 500 GPD single ATU', () => {
    assert.equal(RESIDENTIAL_DEVICES.length, 1);
    assert.equal(RESIDENTIAL_DEVICES[0].stationType, 'single_atu');
    assert.equal(SITE_PROFILES.residential.designGpd, 500);
  });

  it('commercial profile is 10k GPD with 4 quad ATU and 20 simplex lifts', () => {
    assert.equal(COMMERCIAL_DEVICES.length, 24);
    const atus = COMMERCIAL_DEVICES.filter((d) => d.category === 'atu');
    const lifts = COMMERCIAL_DEVICES.filter((d) => d.category === 'lift');
    assert.equal(atus.length, 4);
    assert.ok(atus.every((d) => d.stationType === 'quad_atu'));
    assert.equal(lifts.length, 20);
    assert.ok(lifts.every((d) => d.stationType === 'simplex'));
    const deviceIds = new Set(COMMERCIAL_DEVICES.map((d) => d.deviceId));
    assert.equal(deviceIds.size, 24);
  });

  it('DWTS profile is 10k GPD — 10 simplex per zone, booster, trash, 4×1250 ATU, drip', () => {
    assert.equal(DWTS_DEVICES.length, 24);
    const atus = DWTS_DEVICES.filter((d) => d.category === 'atu');
    const collection = DWTS_DEVICES.filter((d) => d.role === 'collection');
    const boosters = DWTS_DEVICES.filter((d) => d.role === 'booster');
    assert.equal(atus.length, 2);
    assert.ok(atus.every((d) => d.stationType === 'quad_atu' && d.designGpd === 5000));
    assert.equal(collection.length, 20);
    assert.ok(collection.every((d) => d.stationType === 'simplex' && d.designGpd === 500));
    assert.equal(boosters.length, 2);
    assert.ok(boosters.every((d) => d.stationType === 'dual_duplex'));
    const z1Lifts = collection.filter((d) => d.zoneId === 1);
    const z2Lifts = collection.filter((d) => d.zoneId === 2);
    assert.equal(z1Lifts.length, 10);
    assert.equal(z2Lifts.length, 10);
    assert.ok(z1Lifts.every((d) => d.feedsBooster === 'magnolia-bs-1'));
    assert.ok(DWTS_TANK_GUIDE.dispersal === 'drip_drainfield');
    assert.equal(DWTS_TANK_GUIDE.system.treatmentModuleGal, 1250);
    assert.equal(DWTS_TANK_GUIDE.system.treatmentModulesPerZone, 4);
    assert.ok(atus[0].tanks.some((t) => t.id === 'trash' && t.capacityGal >= 1000));
    assert.ok(atus[0].tanks.filter((t) => t.capacityGal === 1250).length === 4);
    assert.ok(atus[0].tanks.some((t) => t.id === 'drip'));
  });

  it('maps every station type to mqtt_parc template', () => {
    for (const key of ['single_atu', 'dual_atu', 'quad_atu', 'simplex', 'dual_duplex']) {
      const meta = stationTypeMeta(key);
      assert.ok(meta.templateId.startsWith('lift_station_'));
      assert.ok(meta.defaultProgram.endsWith('.st'));
      assert.ok(meta.alarmTag);
    }
  });

  it('sizing guide documents cloud-only uplink', () => {
    assert.match(SIZING_GUIDE.deployment, /100% cloud/i);
    assert.ok(SIZING_GUIDE.scaleExamples.some((e) => e.designGpd === 10000));
  });

  it('profiles catalog lists residential, commercial, and dwts', () => {
    const cat = profilesCatalog();
    assert.equal(cat.tenant.slug, TENANT.slug);
    assert.equal(cat.profiles.residential.deviceCount, 1);
    assert.equal(cat.profiles.commercial.deviceCount, 24);
    assert.equal(cat.profiles.dwts.deviceCount, 24);
    assert.equal(cat.profiles.dwts.collection, 20);
    assert.equal(cat.profiles.dwts.booster, 2);
  });

  it('DWTS manifest includes tank guide and role counts', () => {
    const m = profileManifest('dwts');
    assert.equal(m.counts.atu, 2);
    assert.equal(m.counts.step, 20);
    assert.equal(m.counts.booster, 2);
    assert.equal(m.counts.total, 24);
    assert.equal(m.cloudProject, 'atu-cloud-dwts');
    assert.ok(m.tankGuide);
    assert.match(m.description, /DWTS/);
  });

  it('commercial manifest has correct counts', () => {
    const m = profileManifest('commercial');
    assert.equal(m.counts.atu, 4);
    assert.equal(m.counts.lift, 20);
    assert.equal(m.counts.total, 24);
    assert.equal(m.cloudProject, 'atu-cloud-commercial');
  });

  it('CSV includes role and category columns', () => {
    const lines = fleetCsvLines(COMMERCIAL_DEVICES.map((d) => ({ ...d, designGpd: 10000 })));
    assert.match(lines[0], /role,category/);
    assert.equal(lines.length, 25);
  });

  it('generated artifacts exist after generate-artifacts', () => {
    const files = [
      'st/fixtures/fleet_atu_profiles.json',
      'st/fixtures/fleet_atu_residential.json',
      'st/fixtures/fleet_atu_commercial.json',
      'st/fixtures/fleet_import_atu_residential.csv',
      'st/fixtures/fleet_import_atu_commercial.csv',
      'data/projects/atu-cloud-residential.est.json',
      'data/projects/atu-cloud-commercial.est.json',
      'st/logic/atu_fleet_residential_rollup.st',
      'st/logic/atu_fleet_commercial_rollup.st',
      'deploy/cloud/.env.atu-residential.example',
      'deploy/cloud/.env.atu-commercial.example',
      'public/samples/atu-fleet-residential-3d.html',
      'public/samples/atu-fleet-commercial-3d.html',
      'st/fixtures/fleet_dwts_magnolia.json',
      'st/fixtures/fleet_import_dwts_magnolia.csv',
      'data/projects/atu-cloud-dwts.est.json',
      'st/logic/atu_fleet_dwts_rollup.st',
      'deploy/cloud/.env.atu-dwts.example',
      'public/samples/dwts-magnolia-3d.html',
    ];
    for (const rel of files) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    }
  });

  it('commercial cloud est has 24 mqtt_parc drivers', () => {
    const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/atu-cloud-commercial.est.json'), 'utf8'));
    const parc = est.drivers.filter((d) => d.type === 'mqtt_parc');
    assert.equal(parc.length, 24);
    assert.equal(est.settings.atuFleet.counts.total, 24);
    assert.equal(est.settings.mqttParc.enabled, true);
    assert.match(est.settings.hmi.layout.facility3dUrl, /atu-fleet-commercial/);
  });

  it('DWTS cloud est has 24 mqtt_parc drivers with booster and step roles', () => {
    const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/atu-cloud-dwts.est.json'), 'utf8'));
    const parc = est.drivers.filter((d) => d.type === 'mqtt_parc');
    assert.equal(parc.length, 24);
    assert.equal(est.settings.atuFleet.counts.step, 20);
    assert.equal(est.settings.atuFleet.counts.booster, 2);
    assert.ok(est.settings.atuFleet.tankGuide);
    assert.match(est.settings.hmi.layout.facility3dUrl, /dwts-magnolia/);
    const boosters = est.settings.atuFleet.devices.filter((d) => d.role === 'booster');
    assert.equal(boosters.length, 2);
    assert.ok(boosters.every((d) => d.templateId === 'lift_station_dual_duplex'));
    const atus = est.settings.atuFleet.devices.filter((d) => d.category === 'atu');
    assert.equal(atus.length, 2);
    assert.ok(atus.every((d) => d.stationType === 'quad_atu'));
  });

  it('DWTS 3D HTML uses lift stations, plant tanks, and drip field', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/samples/dwts-magnolia-3d.html'), 'utf8');
    assert.match(html, /buildDwtsPlant/);
    assert.match(html, /buildLiftStation/);
    assert.match(html, /drip drainfield/i);
    assert.match(html, /1,250/);
    assert.doesNotMatch(html, /buildHomeStep/);
    assert.doesNotMatch(html, /buildDualAtu/);
  });

  it('residential cloud est has one single ATU driver', () => {
    const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/atu-cloud-residential.est.json'), 'utf8'));
    assert.equal(est.drivers.length, 1);
    assert.equal(est.drivers[0].templateId, 'lift_station_single_atu');
    assert.equal(est.drivers[0].activeProgram, 'logic/32_single_atu.st');
  });

  it('telemetry fixtures build Parc reports for each station type', () => {
    const { buildTelemetryReport } = require('../scripts/atu-fleet/telemetry-fixtures');
    for (const d of [...RESIDENTIAL_DEVICES, ...COMMERCIAL_DEVICES.slice(0, 2)]) {
      const report = buildTelemetryReport(d);
      assert.equal(report.deviceId, d.deviceId);
      assert.ok(Array.isArray(report.tags));
      assert.ok(report.tags.some((t) => t.id === d.alarmTag));
    }
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  TENANT,
  PLANT,
  LIFT_STATIONS,
  fleetManifest,
  fleetCsvLines,
  stationTypeMeta,
} = require('../scripts/putnam-fleet/fleet-data');

const ROOT = path.resolve(__dirname, '..');

describe('putnam fleet configuration', () => {
  it('defines tenant, plant, and six lift stations', () => {
    assert.equal(TENANT.slug, 'putnam-county-utilities');
    assert.equal(PLANT.gatewayId, 'mv_pcu_mle_plant_01');
    assert.equal(LIFT_STATIONS.length, 6);
    const slugs = new Set(LIFT_STATIONS.map((s) => s.slug));
    assert.equal(slugs.size, 6);
    const deviceIds = new Set(LIFT_STATIONS.map((s) => s.deviceId));
    assert.equal(deviceIds.size, 6);
  });

  it('maps every station type to a lift template', () => {
    for (const s of LIFT_STATIONS) {
      const meta = stationTypeMeta(s.stationType);
      assert.ok(meta.templateId.startsWith('lift_station_'));
      assert.ok(meta.defaultProgram.endsWith('.st'));
      assert.ok(meta.alarmTag);
    }
  });

  it('fleet manifest references cloud and plant projects', () => {
    const m = fleetManifest();
    assert.equal(m.tenant.slug, TENANT.slug);
    assert.equal(m.plant.slug, PLANT.slug);
    assert.equal(m.liftStations.length, 6);
    assert.equal(m.cloudProject, 'putnam-county-cloud');
    assert.equal(m.plantProject, 'putnam-mle-plant');
  });

  it('CSV has header and six data rows', () => {
    const lines = fleetCsvLines();
    assert.equal(lines.length, 7);
    assert.match(lines[0], /device_id/);
    assert.match(lines[1], /yelvington-triplex/);
  });

  it('generated artifacts exist after generate-artifacts', () => {
    const files = [
      'st/fixtures/fleet_putnam_county.json',
      'st/fixtures/fleet_import_putnam.csv',
      'data/projects/putnam-county-cloud.est.json',
      'data/projects/putnam-mle-plant.est.json',
      'st/logic/putnam_fleet_rollup.st',
      'deploy/iot-link/.env.putnam-mle.example',
      'deploy/cloud/.env.putnam.example',
      'public/samples/putnam-county-fleet-3d.html',
      'scripts/putnam-fleet/publish-eval-telemetry.js',
      'scripts/putnam-fleet/telemetry-fixtures.js',
      'scripts/putnam-fleet/evaluate-pc.js',
      'scripts/putnam-fleet/seed-cloud.js',
    ];
    for (const rel of files) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    }
  });

  it('cloud est has six mqtt_parc drivers and fleet settings', () => {
    const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/putnam-county-cloud.est.json'), 'utf8'));
    const parc = est.drivers.filter((d) => d.type === 'mqtt_parc');
    assert.equal(parc.length, 6);
    assert.equal(est.settings.putnamFleet.liftStations.length, 6);
    assert.equal(est.settings.mqttParc.enabled, true);
    assert.match(est.settings.hmi.layout.facility3dUrl, /putnam-county-fleet-3d/);
  });

  it('plant est has cloudRemote and IOT-LINK serial ports', () => {
    const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/putnam-mle-plant.est.json'), 'utf8'));
    assert.equal(est.settings.cloudRemote.enabled, true);
    assert.equal(est.settings.cloudRemote.gatewayId, PLANT.gatewayId);
    assert.equal(est.settings.cloudRemote.tenantId, TENANT.tenantId);
    const rtu = est.drivers.filter((d) => d.type === 'modbus_rtu');
    if (rtu.length >= 1) {
      assert.equal(rtu[0].serialPort, PLANT.rs485PortA);
    }
  });

  it('telemetry fixtures cover six lifts and MLE plant', () => {
    const { allFleetDevices, buildTelemetryReport } = require('../scripts/putnam-fleet/telemetry-fixtures');
    const devices = allFleetDevices();
    assert.equal(devices.length, 7);
    for (const d of devices) {
      const report = buildTelemetryReport(d);
      assert.equal(report.deviceId, d.deviceId);
      assert.ok(Array.isArray(report.tags) && report.tags.length >= 1);
    }
  });
});

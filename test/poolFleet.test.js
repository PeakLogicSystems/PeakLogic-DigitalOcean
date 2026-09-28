'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  TENANT,
  RESIDENTIAL_SITE,
  RESIDENTIAL_DEVICE,
  TELEMETRY_TAGS,
  profileManifest,
} = require('../scripts/pool-fleet/fleet-data');
const { defaultFeaturesForRole, userHasFeature } = require('../src/auth/featureCatalog');

const ROOT = path.resolve(__dirname, '..');

describe('pool cloud residential fleet', () => {
  it('defines residential pool site and gateway device', () => {
    assert.equal(RESIDENTIAL_SITE.cloudProject, 'pool-cloud-residential');
    assert.equal(RESIDENTIAL_DEVICE.deviceId, 'mv_pool_maple_01');
    assert.equal(TENANT.tenantSlug, 'pool-cloud');
  });

  it('manifest lists chemistry and status telemetry tags', () => {
    const m = profileManifest();
    assert.equal(m.defaultProject, 'pool-cloud-residential');
    assert.equal(m.homeownerRole, 'homeowner');
    assert.ok(m.telemetryTags.includes('PH_PV'));
    assert.ok(m.telemetryTags.includes('ORP_PV'));
    assert.deepEqual(m.telemetryTags, TELEMETRY_TAGS);
  });

  it('generates bundled project artifacts', () => {
    const estPath = path.join(ROOT, 'data/projects/pool-cloud-residential.est.json');
    const manifestPath = path.join(ROOT, 'st/fixtures/fleet_pool_residential.json');
    const envPath = path.join(ROOT, 'deploy/cloud/.env.pool-residential.example');
    assert.ok(fs.existsSync(estPath), estPath);
    assert.ok(fs.existsSync(manifestPath), manifestPath);
    assert.ok(fs.existsSync(envPath), envPath);

    const est = JSON.parse(fs.readFileSync(estPath, 'utf8'));
    assert.equal(est.project.name, 'pool-cloud-residential');
    assert.equal(est.drivers.length, 1);
    assert.equal(est.drivers[0].type, 'mqtt_parc');
    assert.equal(est.drivers[0].deviceId, 'mv_pool_maple_01');
    assert.equal(est.settings.remoteExecution, true);
    assert.equal(est.settings.startup.projectId, 'pool-cloud-residential');
    assert.equal(est.settings.hmi.activeScreen, 'screen_1');
    assert.ok(est.tags.some((t) => t.id === 'PH_PV'));
    assert.ok(est.tags.some((t) => t.id === 'SITE_ALM'));
    assert.equal(est.settings.poolResidential.profileId, 'residential-pool');
  });
});

describe('homeowner role features', () => {
  it('grants HMI + alarms only (read-only controls)', () => {
    const feats = defaultFeaturesForRole('homeowner');
    assert.equal(feats.hmi, true);
    assert.equal(feats.hmiControl, false);
    assert.equal(feats.alarms, true);
    assert.equal(feats.program, false);
    assert.equal(feats.setup, false);
    assert.equal(feats.cmms, false);
  });

  it('tenant_admin retains full access', () => {
    const admin = { role: 'tenant_admin', features: defaultFeaturesForRole('tenant_admin') };
    assert.equal(userHasFeature(admin, 'program'), true);
    assert.equal(userHasFeature(admin, 'hmiControl'), true);
  });
});

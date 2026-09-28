'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { defaultFeaturesForRole, userHasFeature } = require('../src/auth/featureCatalog');
const { tenantStore } = require('../src/tenants/tenantStore');

describe('cloud tenant roles', () => {
  it('technician gets field-tech features (drivers/tags, no user admin)', () => {
    const feats = defaultFeaturesForRole('technician');
    assert.equal(feats.drivers, true);
    assert.equal(feats.tags, true);
    assert.equal(feats.program, true);
    assert.equal(feats.setup, true);
    assert.equal(feats.users, false);
    assert.equal(feats.project, true);
  });

  it('operator stays read-only on drivers and setup', () => {
    const op = defaultFeaturesForRole('operator');
    const tech = defaultFeaturesForRole('technician');
    assert.equal(op.drivers, false);
    assert.equal(tech.drivers, true);
    assert.equal(op.setup, false);
    assert.equal(tech.setup, true);
  });

  it('tenantStore accepts technician role on createUser', () => {
    const email = `tech-${Date.now()}@example.test`;
    const demo = tenantStore.getTenant('demo');
    assert.ok(demo, 'demo tenant');
    const user = tenantStore.createUser({
      email,
      password: 'test-pass-123',
      name: 'Field Tech',
      role: 'technician',
      tenantId: demo.tenantId,
    });
    assert.equal(user.role, 'technician');
    assert.equal(user.features.drivers, true);
    assert.equal(user.features.users, false);
    assert.equal(userHasFeature(user, 'drivers'), true);
    assert.equal(userHasFeature(user, 'users'), false);
  });

  it('updateFeaturesMatrix persists per-user overrides', () => {
    const email = `op-${Date.now()}@example.test`;
    const demo = tenantStore.getTenant('demo');
    const user = tenantStore.createUser({
      email,
      password: 'test-pass-123',
      role: 'operator',
      tenantId: demo.tenantId,
    });
    const updated = tenantStore.updateFeaturesMatrix(demo.tenantId, {
      [user.userId]: { ...user.features, drivers: true, tags: true },
    });
    assert.equal(updated.length, 1);
    assert.equal(updated[0].features.drivers, true);
    assert.equal(updated[0].features.tags, true);
  });
});

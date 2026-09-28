'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-auth-'));

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { applianceAuthStore } = require('../src/auth/applianceAuthStore');
const { userHasFeature, normalizeFeatures } = require('../src/auth/featureCatalog');
const mongoSysLog = require('../src/logger/mongoSysLog');

describe('applianceAuthStore', () => {
  beforeEach(async () => {
    await mongoSysLog.setConfig(null);
  });

  it('seeds admin and operator users', () => {
    const users = applianceAuthStore.listUsers();
    assert.ok(users.some((u) => u.role === 'admin'));
    assert.ok(users.some((u) => u.role === 'operator'));
  });

  it('logs in with valid credentials and creates a session', () => {
    const admin = applianceAuthStore.listUsers().find((u) => u.role === 'admin');
    assert.ok(admin);
    const result = applianceAuthStore.login({
      email: admin.email,
      password: process.env.PEAKLOGIC_SEED_ADMIN_PASSWORD || 'ChangeMeAdmin!',
    });
    assert.ok(result.token);
    assert.equal(result.user.email, admin.email);
    const sess = applianceAuthStore.sessionFromToken(result.token);
    assert.ok(sess);
    assert.equal(sess.user.userId, admin.userId);
  });

  it('rejects invalid credentials', () => {
    assert.throws(
      () => applianceAuthStore.login({ email: 'admin@local', password: 'wrong' }),
      (e) => e.status === 401,
    );
  });

  it('updates feature matrix for non-admin users', () => {
    const op = applianceAuthStore.listUsers().find((u) => u.role === 'operator');
    const updated = applianceAuthStore.updateFeaturesMatrix({
      [op.userId]: { program: true, tags: true, runtime: false },
    });
    assert.equal(updated.length, 1);
    assert.equal(updated[0].features.program, true);
    assert.equal(updated[0].features.tags, true);
    assert.equal(userHasFeature(updated[0], 'program'), true);
    assert.equal(userHasFeature(updated[0], 'runtime'), false);
  });

  it('admin role always has all features', () => {
    const admin = applianceAuthStore.listUsers().find((u) => u.role === 'admin');
    const feats = normalizeFeatures({ program: false }, 'admin');
    assert.equal(feats.program, true);
    assert.equal(userHasFeature(admin, 'setup'), true);
  });
});

describe('auth audit logging', () => {
  beforeEach(async () => {
    await mongoSysLog.setConfig(null);
  });

  it('records login events in fallback syslog', async () => {
    await mongoSysLog.info('auth', 'User signed in', { email: 'operator@local' }, {
      user: { id: 'u1', email: 'operator@local', name: 'Operator', role: 'operator' },
    });
    const rows = await mongoSysLog.query({ category: 'auth' }, { limit: 5 });
    assert.ok(rows.some((r) => r.message === 'User signed in'));
    assert.equal(rows[0].user.email, 'operator@local');
  });
});

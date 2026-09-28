'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('notificationScopeCatalog', () => {
  let tmpDir;
  let prevData;

  function resetModules() {
    [
      '../src/config',
      '../src/persistence',
      '../src/tenants/tenantPaths',
      '../src/users/notificationScopeCatalog',
    ].forEach((mod) => {
      try { delete require.cache[require.resolve(mod)]; } catch { /* ignore */ }
    });
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-scope-cat-'));
    prevData = process.env.PEAKLOGIC_DATA;
    process.env.PEAKLOGIC_DATA = tmpDir;
    resetModules();
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({
      cmmsIntegration: { siteId: 'plant-a' },
      pdm: {
        assetTags: { 'pump-1': ['AI1'] },
        assetContext: { 'pump-1': { label: 'Pump 1' } },
      },
    }));
    fs.writeFileSync(path.join(tmpDir, 'drivers.json'), JSON.stringify([
      { id: 'PUMP1', type: 'mqtt_parc', deviceId: 'opta_01', name: 'Lift Opta' },
    ]));
  });

  afterEach(() => {
    process.env.PEAKLOGIC_DATA = prevData;
    resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('buildApplianceScopeCatalog lists local sites, devices, and assets', () => {
    const { buildApplianceScopeCatalog } = require('../src/users/notificationScopeCatalog');
    const catalog = buildApplianceScopeCatalog();
    assert.deepEqual(catalog.sites.map((s) => s.siteId), ['plant-a']);
    assert.equal(catalog.devices[0].deviceId, 'opta_01');
    assert.equal(catalog.assets[0].assetId, 'pump-1');
    assert.equal(catalog.assets[0].name, 'Pump 1');
  });
});

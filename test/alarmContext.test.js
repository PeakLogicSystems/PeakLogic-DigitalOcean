'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('alarmContext', () => {
  let tmpDir;
  let prevData;

  function resetModules() {
    [
      '../src/config',
      '../src/persistence',
      '../src/tenants/tenantPaths',
      '../src/tenants/tenantRuntime',
      '../src/alarms/alarmContext',
    ].forEach((mod) => {
      try { delete require.cache[require.resolve(mod)]; } catch { /* ignore */ }
    });
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-alarm-ctx-'));
    prevData = process.env.PEAKLOGIC_DATA;
    process.env.PEAKLOGIC_DATA = tmpDir;
    resetModules();
    const { setApplianceRuntime } = require('../src/tenants/tenantRuntime');
    setApplianceRuntime(null);
    fs.writeFileSync(path.join(tmpDir, 'drivers.json'), JSON.stringify([
      { id: 'PUMP1', type: 'parc-opta', deviceId: 'opta_field_01' },
    ]));
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({
      cmmsIntegration: { siteId: 'local-site' },
      pdm: { assetTags: { 'pump-asset': ['TANK1_LEVEL'] } },
    }));
    const tagsPath = path.join(tmpDir, 'tags.json');
    fs.writeFileSync(tagsPath, JSON.stringify([
      {
        id: 'TANK1_LEVEL',
        label: 'Tank level',
        type: 'REAL',
        driverId: 'PUMP1',
        alarmsEnabled: true,
      },
    ]));
  });

  afterEach(() => {
    process.env.PEAKLOGIC_DATA = prevData;
    resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves deviceId, siteId, and assetIds from tag and driver', () => {
    const { resolveAlarmContext } = require('../src/alarms/alarmContext');
    const ctx = resolveAlarmContext({ tagId: 'TANK1_LEVEL' });
    assert.equal(ctx.deviceId, 'opta_field_01');
    assert.equal(ctx.driverId, 'PUMP1');
    assert.equal(ctx.siteId, 'local-site');
    assert.deepEqual(ctx.assetIds, ['pump-asset']);
  });
});

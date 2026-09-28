'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('tenant workspace isolation', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-tenant-ws-'));
  const dataDir = path.join(tmpRoot, 'data');
  let configStore;
  let runWithProjectTenant;
  let resolveConfigTenantId;

  before(async () => {
    process.env.PEAKLOGIC_DATA = dataDir;
    process.env.PEAKLOGIC_CONFIG_URI = 'memory';
    process.env.PEAKLOGIC_DEPLOYMENT = 'cloud';

    for (const mod of [
      '../src/config',
      '../src/tenants/tenantPaths',
      '../src/project/projectTenantContext',
      '../src/persistence',
      '../src/configStore/mongoBackend',
      '../src/configStore',
      '../src/parc/deviceRegistry',
    ]) {
      delete require.cache[require.resolve(mod)];
    }

    configStore = require('../src/configStore');
    ({ runWithProjectTenant } = require('../src/project/projectTenantContext'));
    ({ resolveConfigTenantId } = require('../src/project/projectTenantContext'));
    await configStore.init();
  });

  after(() => {
    delete process.env.PEAKLOGIC_DATA;
    delete process.env.PEAKLOGIC_CONFIG_URI;
    delete process.env.PEAKLOGIC_DEPLOYMENT;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('stores settings separately per tenant in config cache', async () => {
    await configStore.ensureTenantLoaded('tenant-a', { seedIfEmpty: true });
    await configStore.ensureTenantLoaded('tenant-b', { seedIfEmpty: true });

    runWithProjectTenant('tenant-a', () => {
      const s = configStore.readSync('settings.json', {});
      s.project = { name: 'Org A Studio' };
      configStore.writeSync('settings.json', s);
    });
    runWithProjectTenant('tenant-b', () => {
      const s = configStore.readSync('settings.json', {});
      s.project = { name: 'Org B Studio' };
      configStore.writeSync('settings.json', s);
    });

    const nameA = runWithProjectTenant('tenant-a', () => configStore.readSync('settings.json', {}).project?.name);
    const nameB = runWithProjectTenant('tenant-b', () => configStore.readSync('settings.json', {}).project?.name);
    assert.equal(nameA, 'Org A Studio');
    assert.equal(nameB, 'Org B Studio');
  });

  it('resolves distinct tenant ids from async context', () => {
    const a = runWithProjectTenant('tenant-a', () => resolveConfigTenantId());
    const b = runWithProjectTenant('tenant-b', () => resolveConfigTenantId());
    assert.equal(a, 'tenant-a');
    assert.equal(b, 'tenant-b');
  });

  it('creates isolated on-disk workspace folders per tenant', () => {
    const { ensureTenantWorkspaceDirs, resolveStDir, resolveFacilityDrawDir } = require('../src/tenants/tenantPaths');
    ensureTenantWorkspaceDirs('tenant-a');
    ensureTenantWorkspaceDirs('tenant-b');

    runWithProjectTenant('tenant-a', () => {
      fs.writeFileSync(path.join(resolveStDir(), 'logic-a.st'), 'PROGRAM A');
      fs.mkdirSync(resolveFacilityDrawDir(), { recursive: true });
      fs.writeFileSync(path.join(resolveFacilityDrawDir(), 'active.json'), '{"name":"draw-a"}');
    });
    runWithProjectTenant('tenant-b', () => {
      fs.writeFileSync(path.join(resolveStDir(), 'logic-b.st'), 'PROGRAM B');
    });

    const stA = fs.readFileSync(path.join(dataDir, 'tenants', 'tenant-a', 'st', 'logic-a.st'), 'utf8');
    const stB = fs.readFileSync(path.join(dataDir, 'tenants', 'tenant-b', 'st', 'logic-b.st'), 'utf8');
    assert.equal(stA, 'PROGRAM A');
    assert.equal(stB, 'PROGRAM B');
    assert.ok(fs.existsSync(path.join(dataDir, 'tenants', 'tenant-a', 'facility-draw', 'active.json')));
    assert.ok(!fs.existsSync(path.join(dataDir, 'tenants', 'tenant-b', 'facility-draw', 'active.json')));
  });
});

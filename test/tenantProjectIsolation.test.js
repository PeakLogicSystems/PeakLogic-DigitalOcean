'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('tenant project isolation', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-tenant-proj-'));
  const dataDir = path.join(tmpRoot, 'data');
  let seedTenantBoilerplate;
  let projectStore;
  let runWithProjectTenant;

  before(() => {
    process.env.PEAKLOGIC_DATA = dataDir;
    const boilerplate = path.join(dataDir, 'boilerplate', 'projects');
    fs.mkdirSync(boilerplate, { recursive: true });
    fs.writeFileSync(path.join(boilerplate, 'demo-a.est.zip'), Buffer.from('zip-a'));
    fs.writeFileSync(path.join(boilerplate, 'demo-b.est.zip'), Buffer.from('zip-b'));

    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/tenants/tenantPaths')];
    delete require.cache[require.resolve('../src/project/projectTenantContext')];
    delete require.cache[require.resolve('../src/project/projectStore')];
    delete require.cache[require.resolve('../src/project/seedTenantBoilerplate')];

    ({ seedTenantBoilerplate } = require('../src/project/seedTenantBoilerplate'));
    projectStore = require('../src/project/projectStore');
    ({ runWithProjectTenant } = require('../src/project/projectTenantContext'));
  });

  after(() => {
    delete process.env.PEAKLOGIC_DATA;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('seeds boilerplate into tenant-specific directories', () => {
    const t1 = 'tenant-aaa';
    const t2 = 'tenant-bbb';
    const r1 = seedTenantBoilerplate(t1);
    const r2 = seedTenantBoilerplate(t2);
    assert.equal(r1.copied, 2);
    assert.equal(r2.copied, 2);
    assert.ok(fs.existsSync(path.join(dataDir, 'tenants', t1, 'projects', 'demo-a.est.zip')));
    assert.ok(fs.existsSync(path.join(dataDir, 'tenants', t2, 'projects', 'demo-b.est.zip')));
  });

  it('copies newly added boilerplate zips when marker already exists', () => {
    const tid = 'tenant-incr';
    const projectsDir = path.join(dataDir, 'tenants', tid, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    fs.writeFileSync(path.join(projectsDir, 'demo-a.est.zip'), Buffer.from('zip-a'));
    fs.writeFileSync(path.join(projectsDir, '.boilerplate-seeded'), JSON.stringify({
      seededAt: new Date().toISOString(),
      projectIds: ['demo-a'],
    }));
    const r = seedTenantBoilerplate(tid);
    assert.equal(r.skipped, false);
    assert.equal(r.copied, 1);
    assert.ok(fs.existsSync(path.join(projectsDir, 'demo-b.est.zip')));
  });

  it('lists only projects for the active tenant context', () => {
    const t1 = 'tenant-aaa';
    const t2 = 'tenant-bbb';
    runWithProjectTenant(t1, () => {
      projectStore.saveProjectArchive('tenant-only-a', Buffer.from('tenant-a-project'));
    });
    runWithProjectTenant(t2, () => {
      projectStore.saveProjectArchive('tenant-only-b', Buffer.from('tenant-b-project'));
    });

    const list1 = runWithProjectTenant(t1, () => projectStore.listProjects().map((p) => p.id));
    const list2 = runWithProjectTenant(t2, () => projectStore.listProjects().map((p) => p.id));

    assert.ok(list1.includes('tenant-only-a'));
    assert.ok(!list1.includes('tenant-only-b'));
    assert.ok(list2.includes('tenant-only-b'));
    assert.ok(!list2.includes('tenant-only-a'));
  });
});

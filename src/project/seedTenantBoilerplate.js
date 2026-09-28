'use strict';

const fs = require('fs');
const path = require('path');
const {
  boilerplateProjectsDir,
  ensureTenantProjectsDir,
} = require('../tenants/tenantPaths');
const { tenantStore } = require('../tenants/tenantStore');
const { ZIP_EXT } = require('./projectStore');
const { DATA_DIR } = require('../config');

function listBoilerplateZips() {
  const src = boilerplateProjectsDir();
  if (!fs.existsSync(src)) return [];
  return fs.readdirSync(src).filter((f) => f.toLowerCase().endsWith(ZIP_EXT));
}

function listTenantIdsForBoilerplateSeed() {
  const ids = new Set();
  for (const tenant of tenantStore.listTenants()) {
    if (tenant?.tenantId) ids.add(tenant.tenantId);
  }
  const tenantsRoot = path.join(DATA_DIR, 'tenants');
  if (fs.existsSync(tenantsRoot)) {
    for (const name of fs.readdirSync(tenantsRoot)) {
      const fp = path.join(tenantsRoot, name);
      if (fs.statSync(fp).isDirectory()) ids.add(name);
    }
  }
  return [...ids];
}

function seedTenantBoilerplate(tenantId, opts = {}) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required');
  const force = !!opts.force;
  const dest = ensureTenantProjectsDir(tid);
  const marker = path.join(dest, '.boilerplate-seeded');
  const existingZips = fs.existsSync(dest)
    ? fs.readdirSync(dest).filter((f) => f.toLowerCase().endsWith(ZIP_EXT))
    : [];
  const existingSet = new Set(existingZips);
  const boilerplateZips = listBoilerplateZips();
  const missingFromTenant = boilerplateZips.filter((f) => !existingSet.has(f));

  if (!force && fs.existsSync(marker) && existingZips.length && !missingFromTenant.length) {
    return {
      tenantId: tid,
      copied: 0,
      skipped: true,
      projectIds: existingZips.map((f) => f.slice(0, -ZIP_EXT.length)),
    };
  }

  const src = boilerplateProjectsDir();
  if (!fs.existsSync(src)) {
    throw new Error(`Boilerplate projects directory missing: ${src}`);
  }

  let copied = 0;
  const projectIds = [];
  for (const file of listBoilerplateZips()) {
    const destFp = path.join(dest, file);
    if (!force && fs.existsSync(destFp)) {
      projectIds.push(file.slice(0, -ZIP_EXT.length));
      continue;
    }
    fs.copyFileSync(path.join(src, file), destFp);
    copied += 1;
    projectIds.push(file.slice(0, -ZIP_EXT.length));
  }

  fs.writeFileSync(marker, JSON.stringify({
    seededAt: new Date().toISOString(),
    source: src,
    projectIds,
  }, null, 2));

  return { tenantId: tid, copied, skipped: false, projectIds };
}

function seedAllTenantsBoilerplate(opts = {}) {
  const results = [];
  for (const tenantId of listTenantIdsForBoilerplateSeed()) {
    try {
      results.push(seedTenantBoilerplate(tenantId, opts));
    } catch (e) {
      results.push({ tenantId, error: e.message || String(e) });
    }
  }
  return results;
}

function syncBoilerplateFromLibrary(rootDir) {
  const root = rootDir || path.join(__dirname, '..', '..');
  const library = path.join(root, 'data', 'projects');
  const dest = path.join(root, 'data', 'boilerplate', 'projects');
  if (!fs.existsSync(library)) return { dest, copied: 0 };
  fs.mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const file of fs.readdirSync(library)) {
    if (!file.toLowerCase().endsWith(ZIP_EXT)) continue;
    fs.copyFileSync(path.join(library, file), path.join(dest, file));
    copied += 1;
  }
  return { dest, copied };
}

module.exports = {
  seedTenantBoilerplate,
  seedAllTenantsBoilerplate,
  syncBoilerplateFromLibrary,
  listBoilerplateZips,
  listTenantIdsForBoilerplateSeed,
};

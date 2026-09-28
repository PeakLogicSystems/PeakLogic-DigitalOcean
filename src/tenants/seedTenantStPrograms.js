'use strict';

const fs = require('fs');
const path = require('path');
const { ST_DIR } = require('../config');
const { tenantRootDir } = require('./tenantPaths');
const programStore = require('../programs/programStore');
const { runWithProjectTenant } = require('../project/projectTenantContext');

function tenantStRoot(tenantId) {
  return path.join(tenantRootDir(tenantId), 'st');
}

function countStFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return 0;
  return programStore.listProgramsInRoot(rootDir).length;
}

function copyStTree(srcRoot, destRoot, opts = {}) {
  if (!fs.existsSync(srcRoot)) return 0;
  const force = !!opts.force;
  let copied = 0;

  function walk(relDir) {
    const abs = path.join(srcRoot, relDir);
    if (!fs.existsSync(abs)) return;
    for (const name of fs.readdirSync(abs)) {
      const rel = relDir ? `${relDir}/${name}` : name;
      const full = path.join(srcRoot, rel);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(rel);
        continue;
      }
      if (!name.toLowerCase().endsWith('.st')) continue;
      const dest = path.join(destRoot, rel);
      if (!force && fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(full, dest);
      copied += 1;
    }
  }

  walk('');
  return copied;
}

function seedTenantStPrograms(tenantId, opts = {}) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required');
  const force = !!opts.force;
  const destRoot = tenantStRoot(tid);
  fs.mkdirSync(destRoot, { recursive: true });
  const copied = copyStTree(ST_DIR, destRoot, { force });
  runWithProjectTenant(tid, () => {
    try { programStore.migrateLegacyProgram(); } catch { /* ignore */ }
  });
  return { tenantId: tid, copied, skipped: copied === 0, total: countStFiles(destRoot) };
}

function seedAllTenantsStPrograms(opts = {}) {
  const { tenantStore } = require('./tenantStore');
  const results = [];
  for (const tenant of tenantStore.listTenants()) {
    try {
      results.push(seedTenantStPrograms(tenant.tenantId, opts));
    } catch (e) {
      results.push({ tenantId: tenant.tenantId, error: e.message || String(e) });
    }
  }
  return results;
}

module.exports = {
  seedTenantStPrograms,
  seedAllTenantsStPrograms,
  countStFiles,
};

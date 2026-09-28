'use strict';

const configStore = require('../configStore');
const { ensureTenantWorkspaceDirs } = require('./tenantPaths');
const { runWithProjectTenant } = require('../project/projectTenantContext');
const { seedTenantStPrograms } = require('./seedTenantStPrograms');

async function seedTenantWorkspace(tenantId) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required');
  ensureTenantWorkspaceDirs(tid);
  const st = seedTenantStPrograms(tid);
  const cfg = await runWithProjectTenant(tid, async () => configStore.ensureTenantLoaded(tid, { seedIfEmpty: true }));
  return { ...cfg, tenantId: tid, stPrograms: st };
}

async function seedAllTenantsWorkspace() {
  const { tenantStore } = require('./tenantStore');
  const results = [];
  for (const tenant of tenantStore.listTenants()) {
    try {
      results.push(await seedTenantWorkspace(tenant.tenantId));
    } catch (e) {
      results.push({ tenantId: tenant.tenantId, error: e.message || String(e) });
    }
  }
  return results;
}

module.exports = { seedTenantWorkspace, seedAllTenantsWorkspace };

#!/usr/bin/env node
'use strict';

/** Copy bundled boilerplate into each tenant's isolated project library (cloud SaaS). */
process.env.PEAKLOGIC_DEPLOYMENT = process.env.PEAKLOGIC_DEPLOYMENT || 'cloud';

const {
  seedAllTenantsBoilerplate,
  syncBoilerplateFromLibrary,
} = require('../src/project/seedTenantBoilerplate');
const { seedAllTenantsWorkspace } = require('../src/tenants/seedTenantWorkspace');
const { seedAllTenantsStPrograms } = require('../src/tenants/seedTenantStPrograms');

try {
  syncBoilerplateFromLibrary();
} catch (e) {
  console.warn('[seed-tenant-projects] boilerplate sync:', e.message || e);
}

const results = seedAllTenantsBoilerplate({ force: process.argv.includes('--force') });
for (const row of results) {
  if (row.error) {
    console.warn(`[seed-tenant-projects] ${row.tenantId}: ${row.error}`);
  } else {
    console.log(`[seed-tenant-projects] ${row.tenantId}: ${row.copied} copied, ${row.projectIds.length} total`);
  }
}

seedAllTenantsWorkspace().then((wsRows) => {
  for (const row of wsRows) {
    if (row.error) console.warn(`[seed-tenant-workspace] ${row.tenantId}: ${row.error}`);
    else if (row.seeded) console.log(`[seed-tenant-workspace] ${row.tenantId}: seeded blank workspace`);
  }
}).catch((e) => {
  console.warn('[seed-tenant-workspace]', e.message || e);
});

for (const row of seedAllTenantsStPrograms()) {
  if (row.error) console.warn(`[seed-tenant-st] ${row.tenantId}: ${row.error}`);
  else if (row.skipped) console.log(`[seed-tenant-st] ${row.tenantId}: ${row.total} program(s) already present`);
  else console.log(`[seed-tenant-st] ${row.tenantId}: copied ${row.copied} program(s), ${row.total} total`);
}

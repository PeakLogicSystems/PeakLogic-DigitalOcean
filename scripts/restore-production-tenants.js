'use strict';

/** Restore tenant orgs wiped by bundle deploy. Safe to re-run (skips existing slugs). */
process.env.PEAKLOGIC_DEPLOYMENT = process.env.PEAKLOGIC_DEPLOYMENT || 'cloud';

const fs = require('fs');
const path = require('path');
const { tenantStore } = require('../src/tenants/tenantStore');
const { DATA_DIR } = require('../src/config');

const TO_RESTORE = [
  { tenantSlug: 'volition', name: 'Volition', tenantType: 'customer' },
  { tenantSlug: 'peaklogic', name: 'PeakLogic System', tenantType: 'customer', cmmsEnabled: true },
];

const dataFile = path.join(DATA_DIR, 'cloud_tenants.json');
const backup = `${dataFile}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(dataFile, backup);
console.log('[restore-tenants] backup', backup);

for (const spec of TO_RESTORE) {
  const slug = spec.tenantSlug;
  if (tenantStore.getTenant(slug)) {
    console.log('[restore-tenants] skip (exists)', slug);
    continue;
  }
  try {
    const t = tenantStore.createTenant(spec);
    console.log('[restore-tenants] created', t.tenantSlug, t.name);
  } catch (e) {
    console.error('[restore-tenants] failed', slug, e.message || e);
  }
}

console.log('[restore-tenants] current orgs:');
for (const t of tenantStore.listTenants()) {
  console.log(' ', t.tenantSlug, '-', t.name, t.tenantType || 'customer');
}

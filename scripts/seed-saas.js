'use strict';

/** Seed demo tenants/users and bundled Studio projects (run once after install). */
process.env.PEAKLOGIC_DEPLOYMENT = process.env.PEAKLOGIC_DEPLOYMENT || 'cloud';

const { tenantStore } = require('../src/tenants/tenantStore');

try {
  const { ensureBundledProjects } = require('./ensure-bundled-projects');
  ensureBundledProjects();
} catch (e) {
  console.warn('[seed] bundled projects:', e.message || e);
}

const tenants = tenantStore.listTenants();
const users = tenantStore.listUsers();
console.log('[seed] PeakLogic Cloud SaaS ready');
console.log(`[seed] tenants: ${tenants.length}, users: ${users.length}`);
for (const u of users) {
  console.log(`[seed]   ${u.role} ${u.email}${u.tenantSlug ? ` (org ${u.tenantSlug})` : ''}`);
}
console.log('[seed] Sign in at /login — default org demo, operator@demo.local / demo, homeowner@demo.local / demo');

'use strict';

/** Reset or create platform_admin from PEAKLOGIC_SEED_ADMIN_* in saas.env */
require('../src/loadEnv');
process.env.PEAKLOGIC_DEPLOYMENT = process.env.PEAKLOGIC_DEPLOYMENT || 'cloud';

const { hashPassword, randomToken } = require('../src/tenants/authCrypto');
const { tenantStore } = require('../src/tenants/tenantStore');

const email = String(process.env.PEAKLOGIC_SEED_ADMIN_EMAIL || 'admin@peaklogic.io').trim().toLowerCase();
const password = String(process.env.PEAKLOGIC_SEED_ADMIN_PASSWORD || '').trim();

if (!password || /CHANGE_ME/i.test(password)) {
  console.error('[reset-platform-admin] Set PEAKLOGIC_SEED_ADMIN_PASSWORD in saas.env first');
  process.exit(1);
}

const users = Object.values(tenantStore._store.users);
let admin = users.find((u) => u.role === 'platform_admin');
if (!admin) {
  admin = users.find((u) => u.email === email);
}
if (!admin) {
  const userId = `user_${randomToken(6)}`;
  admin = {
    userId,
    email,
    name: 'PeakLogic System Admin',
    role: 'platform_admin',
    tenantId: null,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  tenantStore._store.users[userId] = admin;
  console.log('[reset-platform-admin] created platform_admin', email);
} else {
  admin.role = 'platform_admin';
  admin.tenantId = null;
  admin.email = email;
  admin.passwordHash = hashPassword(password);
  admin.invitePending = false;
  delete admin.inviteToken;
  delete admin.inviteExpiresAt;
  console.log('[reset-platform-admin] updated platform_admin', email);
}

const persistence = require('../src/persistence');
persistence.writeJson('cloud_tenants.json', tenantStore._store);
console.log('[reset-platform-admin] Sign in at /login — Organization ID: leave blank');
console.log('[reset-platform-admin] Email:', email);

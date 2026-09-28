'use strict';

/**
 * Platform-admin tenant management, backed by the real tenantStore
 * (file-persisted; the same store the live tenant-login/Cloud Studio
 * flow uses — see src/tenants/tenantStore.js).
 */
const { tenantStore } = require('../tenants/tenantStore');

async function listAllTenants() {
  return tenantStore.listTenants().map((t) => ({
    ...t,
    userCount: tenantStore.listUsers(t.tenantId).length,
  }));
}

async function getTenantDetail(tenantId) {
  const tenant = tenantStore.getTenant(tenantId);
  if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };
  const users = tenantStore.listUsers(tenant.tenantId);
  return {
    ok: true,
    tenant: tenantStore.publicTenant(tenant),
    users,
    userCount: users.length,
  };
}

async function createTenantAsPlatform({ tenantName, tenantSlug, email, password, cmmsEnabled } = {}) {
  const name = String(tenantName || '').trim();
  if (!name) return { ok: false, status: 400, error: 'Organization name is required' };
  if (!email || !password) return { ok: false, status: 400, error: 'Admin email and password are required' };

  let tenant;
  try {
    tenant = tenantStore.createTenant({ tenantSlug: tenantSlug || name, name, cmmsEnabled });
  } catch (err) {
    return { ok: false, status: err.status || 400, error: err.message };
  }

  let user;
  try {
    user = tenantStore.createUser({
      email,
      password,
      name: email,
      role: 'tenant_admin',
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    return { ok: false, status: err.status || 400, error: err.message };
  }

  return { ok: true, tenant, user };
}

async function updateTenantCmms(tenantId, { enabled, externalUrl } = {}) {
  try {
    const tenant = tenantStore.patchTenantCmms(tenantId, { enabled, externalUrl });
    return { ok: true, tenant };
  } catch (err) {
    return { ok: false, status: err.status || 400, error: err.message };
  }
}

async function getTenantCmmsEntitlement(tenantId) {
  const tenant = tenantStore.getTenant(tenantId);
  if (!tenant) return null;
  return {
    enabled: !!(tenant.cmms && tenant.cmms.enabled),
    externalUrl: (tenant.cmms && tenant.cmms.externalUrl) || '',
  };
}

module.exports = {
  listAllTenants,
  getTenantDetail,
  createTenantAsPlatform,
  updateTenantCmms,
  getTenantCmmsEntitlement,
};

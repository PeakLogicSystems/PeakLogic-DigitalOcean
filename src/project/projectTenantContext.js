'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { TENANT_ID } = require('../config');
const { isCloudDeployment } = require('../cloud/agentProtocol');

const storage = new AsyncLocalStorage();

function activeTenantIdFromSession(req) {
  try {
    return require('../tenants/authMiddleware').activeTenantId(req);
  } catch {
    return null;
  }
}

function getTenantStore() {
  return require('../tenants/tenantStore').tenantStore;
}

function runWithProjectTenant(tenantId, fn) {
  return storage.run({ tenantId: String(tenantId || '').trim() || null }, fn);
}

function getProjectTenantId() {
  const store = storage.getStore();
  return store?.tenantId || null;
}

function resolveConfigTenantId() {
  const fromCtx = getProjectTenantId();
  if (fromCtx) return fromCtx;
  return TENANT_ID;
}

function resolveProjectTenantId(req) {
  const fromSession = activeTenantIdFromSession(req);
  if (fromSession) return fromSession;
  if (req.mvAuth?.user?.role === 'platform_admin') {
    const q = String(req.query?.tenantId || req.body?.tenantId || '').trim();
    if (q) return q;
  }
  return req.mvAuth?.user?.tenantId || null;
}

function requireProjectTenant(req, res, next) {
  if (!isCloudDeployment()) return next();
  if (!req.mvAuth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const tid = resolveProjectTenantId(req);
  if (!tid) {
    return res.status(403).json({ error: 'Select an organization to access projects' });
  }
  if (req.mvAuth.user.role !== 'platform_admin') {
    const tenantStore = getTenantStore();
    const user = tenantStore.getUser(req.mvAuth.user.userId);
    if (!user || !tenantStore.userCanAccessTenant(user, tid)) {
      return res.status(403).json({ error: 'No tenant context' });
    }
  }
  return runWithProjectTenant(tid, () => next());
}

module.exports = {
  runWithProjectTenant,
  getProjectTenantId,
  resolveConfigTenantId,
  resolveProjectTenantId,
  requireProjectTenant,
};

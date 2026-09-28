'use strict';

const { isPartnerRole } = require('./tenantRoles');

/**
 * Whether a user may operate in the given tenant (session activeTenantId).
 * @param {object} user - raw or public user record
 * @param {string|null} tenantId
 * @param {function} getTenant - tenantStore.getTenant
 */
function canAccessTenant(user, tenantId, getTenant) {
  if (!user || !tenantId) return false;
  if (user.role === 'platform_admin') return true;
  const tid = String(tenantId);
  if (String(user.tenantId || '') === tid) return true;
  if (!isPartnerRole(user.role)) return false;
  const customer = getTenant(tid);
  return !!(customer && String(customer.partnerId || '') === String(user.tenantId || ''));
}

/** Tenants this user may switch into (for org picker). */
function listAccessibleTenants(user, listTenants, getTenant) {
  if (!user) return [];
  if (user.role === 'platform_admin') return listTenants();
  if (isPartnerRole(user.role)) {
    const home = getTenant(user.tenantId);
    const homePub = home ? listTenants().find((t) => t.tenantId === home.tenantId) : null;
    const linked = listTenants().filter((t) => String(t.partnerId || '') === String(user.tenantId || ''));
    const out = [];
    const seen = new Set();
    for (const t of [homePub, ...linked]) {
      if (t && !seen.has(t.tenantId)) {
        seen.add(t.tenantId);
        out.push(t);
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  const own = getTenant(user.tenantId);
  return own ? [listTenants().find((t) => t.tenantId === own.tenantId)].filter(Boolean) : [];
}

function isPartnerHomeSession(user, activeTenantId) {
  if (!user || !isPartnerRole(user.role)) return false;
  return String(activeTenantId || '') === String(user.tenantId || '');
}

module.exports = {
  canAccessTenant,
  listAccessibleTenants,
  isPartnerHomeSession,
};

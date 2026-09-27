'use strict';

const { getDb } = require('../db/mongo');
const authService = require('./authService');
const { normalizeCmmsEntitlement } = require('../tenants/cmmsEntitlement');
const { normalizeTenantPlan } = require('../tenants/tenantPlan');

function now() {
  return new Date();
}

function unwrapFindOneAndUpdate(result) {
  if (!result) return null;
  if (Object.prototype.hasOwnProperty.call(result, 'value')) return result.value;
  return result;
}

/**
 * @param {string} tenantId
 * @param {object} patch
 * @param {{ enabledBy?: string|null }} [opts]
 */
async function updateTenantCmms(tenantId, patch, opts = {}) {
  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };

  const cmms = normalizeCmmsEntitlement(
    { ...tenant.cmms, ...patch },
    { enabledAt: now(), enabledBy: opts.enabledBy || null },
  );

  const result = await db.collection('tenants').findOneAndUpdate(
    { _id: tenantId },
    { $set: { cmms, updatedAt: now() } },
    { returnDocument: 'after' },
  );
  const doc = unwrapFindOneAndUpdate(result);
  if (!doc) return { ok: false, status: 404, error: 'Tenant not found' };
  return { ok: true, tenant: authService.publicTenant(doc) };
}

/**
 * Update PeakLogic subscription plan and/or CMMS entitlement in one write.
 * @param {string} tenantId
 * @param {{ plan?: string, cmms?: object }} patch
 * @param {{ enabledBy?: string|null }} [opts]
 */
async function updateTenantSettings(tenantId, patch, opts = {}) {
  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };

  const updates = { updatedAt: now() };
  if (patch.plan != null) {
    updates.plan = normalizeTenantPlan(patch.plan, tenant.plan || 'standard');
  }
  if (patch.cmms != null) {
    updates.cmms = normalizeCmmsEntitlement(
      { ...tenant.cmms, ...patch.cmms },
      { enabledAt: now(), enabledBy: opts.enabledBy || null },
    );
  }

  const result = await db.collection('tenants').findOneAndUpdate(
    { _id: tenantId },
    { $set: updates },
    { returnDocument: 'after' },
  );
  const doc = unwrapFindOneAndUpdate(result);
  if (!doc) return { ok: false, status: 404, error: 'Tenant not found' };
  return { ok: true, tenant: authService.publicTenant(doc) };
}

/**
 * @param {string} tenantId
 * @param {string} plan
 */
async function updateTenantPlan(tenantId, plan) {
  return updateTenantSettings(tenantId, { plan });
}

async function getTenantCmmsEntitlement(tenantId) {
  const tenant = await getDb().collection('tenants').findOne({ _id: tenantId });
  if (!tenant) return null;
  return normalizeCmmsEntitlement(tenant.cmms);
}

async function listAllTenants() {
  const db = getDb();
  const tenants = await db.collection('tenants').find({}).sort({ name: 1 }).toArray();
  const counts = await db.collection('users').aggregate([
    { $group: { _id: '$tenantId', userCount: { $sum: 1 } } },
  ]).toArray();
  const countByTenant = Object.fromEntries(counts.map((c) => [c._id, c.userCount]));
  return tenants.map((doc) => ({
    ...authService.publicTenant(doc),
    userCount: countByTenant[doc._id] || 0,
  }));
}

async function getTenantDetail(tenantId) {
  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };
  const users = await authService.listTenantUsers(tenantId);
  return {
    ok: true,
    tenant: authService.publicTenant(tenant),
    users,
    userCount: users.length,
  };
}

async function createTenantAsPlatform(input) {
  return authService.signup(input, {
    platformAdmin: true,
    enabledBy: 'platform-admin',
  });
}

module.exports = {
  updateTenantCmms,
  updateTenantSettings,
  updateTenantPlan,
  getTenantCmmsEntitlement,
  listAllTenants,
  getTenantDetail,
  createTenantAsPlatform,
};

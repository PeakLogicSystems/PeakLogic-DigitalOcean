'use strict';

const { getDb } = require('../db/mongo');
const authService = require('./authService');
const { normalizeSlug, isValidSlug } = require('../util/slug');
const { normalizeCmmsEntitlement } = require('../tenants/cmmsEntitlement');
const { normalizeTenantPlan } = require('../tenants/tenantPlan');

const TENANT_SCOPED_COLLECTIONS = [
  'users',
  'locations',
  'systems',
  'devices',
  'cmms_facilities',
  'cmms_assets',
  'cmms_workorders',
  'alarm_notify_queue',
  'password_reset_tokens',
  'cmms_alarm_events',
  'device_telemetry_latest',
  'device_telemetry',
  'parc_devices',
  'project_repository',
  'connectivity_billing',
];

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

/**
 * @param {string} tenantId
 * @param {{ name?: string, tenantName?: string, slug?: string, tenantSlug?: string }} input
 */
async function updateTenantProfile(tenantId, input) {
  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };

  const name = String(input.name ?? input.tenantName ?? '').trim();
  if (!name) return { ok: false, status: 400, error: 'Organization name is required' };

  const updates = { name, updatedAt: now() };
  const slugRaw = input.slug ?? input.tenantSlug;
  if (slugRaw != null && String(slugRaw).trim()) {
    const slug = normalizeSlug(slugRaw);
    if (!isValidSlug(slug)) return { ok: false, status: 400, error: 'Invalid slug' };
    if (slug !== tenant.slug) {
      const dup = await db.collection('tenants').findOne({ slug, _id: { $ne: tenantId } });
      if (dup) return { ok: false, status: 409, error: 'Slug already in use' };
      updates.slug = slug;
    }
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
 * Permanently delete a tenant and all tenant-scoped data.
 * @param {string} tenantId
 * @param {{ confirmSlug?: string }} input
 */
async function deleteTenant(tenantId, input = {}) {
  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };

  const confirmSlug = normalizeSlug(input.confirmSlug || '');
  if (!confirmSlug || confirmSlug !== tenant.slug) {
    return {
      ok: false,
      status: 400,
      error: 'Type the tenant slug exactly to confirm deletion.',
    };
  }

  for (const name of TENANT_SCOPED_COLLECTIONS) {
    await db.collection(name).deleteMany({ tenantId });
  }
  await db.collection('tenants').deleteOne({ _id: tenantId });
  return { ok: true, deletedId: tenantId, slug: tenant.slug };
}

module.exports = {
  updateTenantCmms,
  updateTenantSettings,
  updateTenantPlan,
  getTenantCmmsEntitlement,
  listAllTenants,
  getTenantDetail,
  createTenantAsPlatform,
  updateTenantProfile,
  deleteTenant,
};

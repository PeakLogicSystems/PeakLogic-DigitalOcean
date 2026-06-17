'use strict';

const { randomUUID } = require('crypto');
const { getDb } = require('../db/mongo');
const { LIMITS } = require('../config');
const { hashPassword } = require('../auth/password');
const { normalizeSlug, isValidSlug } = require('../util/slug');

function now() {
  return new Date();
}

function publicUser(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    tenantId: doc.tenantId,
    email: doc.email,
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function publicTenant(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    slug: doc.slug,
    name: doc.name,
    plan: doc.plan,
    maxLocations: doc.maxLocations,
    maxSystemsPerLocation: doc.maxSystemsPerLocation,
    maxDevicesPerSystem: doc.maxDevicesPerSystem,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Create tenant + admin user atomically.
 * @param {{ tenantName: string, tenantSlug?: string, email: string, password: string }} input
 */
async function signup(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const name = String(input.tenantName || '').trim();
  let slug = normalizeSlug(input.tenantSlug || name);

  if (!name) return { ok: false, status: 400, error: 'tenantName is required' };
  if (!email || !email.includes('@')) return { ok: false, status: 400, error: 'Valid email is required' };
  if (password.length < 8) return { ok: false, status: 400, error: 'Password must be at least 8 characters' };
  if (!isValidSlug(slug)) return { ok: false, status: 400, error: 'Invalid tenant slug' };

  const db = getDb();
  const tenants = db.collection('tenants');
  const users = db.collection('users');

  const existingTenant = await tenants.findOne({ slug });
  if (existingTenant) {
    return { ok: false, status: 409, error: 'Tenant slug already in use' };
  }

  const tenantId = randomUUID();
  const userId = randomUUID();
  const ts = now();
  const passwordHash = await hashPassword(password);

  const tenantDoc = {
    _id: tenantId,
    slug,
    name,
    plan: 'standard',
    maxLocations: LIMITS.locationsPerTenant,
    maxSystemsPerLocation: LIMITS.systemsPerLocation,
    maxDevicesPerSystem: LIMITS.devicesPerSystem,
    createdAt: ts,
    updatedAt: ts,
  };

  const userDoc = {
    _id: userId,
    tenantId,
    email,
    passwordHash,
    role: 'admin',
    createdAt: ts,
    updatedAt: ts,
  };

  try {
    await tenants.insertOne(tenantDoc);
    await users.insertOne(userDoc);
  } catch (err) {
    await tenants.deleteOne({ _id: tenantId });
    if (err.code === 11000) {
      return { ok: false, status: 409, error: 'Account already exists' };
    }
    throw err;
  }

  return {
    ok: true,
    tenant: publicTenant(tenantDoc),
    user: publicUser(userDoc),
  };
}

/**
 * @param {{ tenantSlug: string, email: string, password: string }} input
 */
async function login(input) {
  const tenantSlug = normalizeSlug(input.tenantSlug);
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');

  if (!isValidSlug(tenantSlug)) return { ok: false, status: 400, error: 'tenantSlug is required' };
  if (!email) return { ok: false, status: 400, error: 'email is required' };
  if (!password) return { ok: false, status: 400, error: 'password is required' };

  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ slug: tenantSlug });
  if (!tenant) return { ok: false, status: 401, error: 'Invalid credentials' };

  const user = await db.collection('users').findOne({ tenantId: tenant._id, email });
  if (!user) return { ok: false, status: 401, error: 'Invalid credentials' };

  const { verifyPassword } = require('../auth/password');
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, status: 401, error: 'Invalid credentials' };

  return {
    ok: true,
    tenant: publicTenant(tenant),
    user: publicUser(user),
  };
}

async function getUserById(tenantId, userId) {
  const user = await getDb().collection('users').findOne({ _id: userId, tenantId });
  return publicUser(user);
}

async function getTenantById(tenantId) {
  const tenant = await getDb().collection('tenants').findOne({ _id: tenantId });
  return publicTenant(tenant);
}

module.exports = {
  signup,
  login,
  getUserById,
  getTenantById,
  publicUser,
  publicTenant,
};

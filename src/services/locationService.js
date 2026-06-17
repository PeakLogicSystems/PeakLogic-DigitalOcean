'use strict';

const { randomUUID } = require('crypto');
const { getDb } = require('../db/mongo');
const { checkCreateLimit, tenantLimits } = require('./limits');
const { normalizeSlug, isValidSlug } = require('../util/slug');

function now() {
  return new Date();
}

function publicLocation(doc) {
  return {
    id: doc._id,
    tenantId: doc.tenantId,
    slug: doc.slug,
    name: doc.name,
    description: doc.description ?? null,
    metadata: doc.metadata ?? {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listLocations(tenantId) {
  const docs = await getDb().collection('locations')
    .find({ tenantId })
    .sort({ name: 1 })
    .toArray();
  return docs.map(publicLocation);
}

async function getLocation(tenantId, id) {
  const doc = await getDb().collection('locations').findOne({ _id: id, tenantId });
  return doc ? publicLocation(doc) : null;
}

async function createLocation(tenantId, input) {
  const name = String(input.name || '').trim();
  let slug = normalizeSlug(input.slug || name);
  if (!name) return { ok: false, status: 400, error: 'name is required' };
  if (!isValidSlug(slug)) return { ok: false, status: 400, error: 'Invalid slug' };

  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };

  const limits = tenantLimits(tenant);
  const count = await db.collection('locations').countDocuments({ tenantId });
  const limitCheck = checkCreateLimit(count, limits.locations, 'Location');
  if (!limitCheck.ok) return { ok: false, status: 403, error: limitCheck.error };

  const ts = now();
  const doc = {
    _id: randomUUID(),
    tenantId,
    slug,
    name,
    description: input.description ? String(input.description) : null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    createdAt: ts,
    updatedAt: ts,
  };

  try {
    await db.collection('locations').insertOne(doc);
  } catch (err) {
    if (err.code === 11000) return { ok: false, status: 409, error: 'Location slug already exists' };
    throw err;
  }

  return { ok: true, location: publicLocation(doc) };
}

async function updateLocation(tenantId, id, input) {
  const updates = { updatedAt: now() };
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) return { ok: false, status: 400, error: 'name cannot be empty' };
    updates.name = name;
  }
  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (!isValidSlug(slug)) return { ok: false, status: 400, error: 'Invalid slug' };
    updates.slug = slug;
  }
  if (input.description !== undefined) updates.description = input.description ? String(input.description) : null;
  if (input.metadata !== undefined) {
    updates.metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  }

  try {
    const result = await getDb().collection('locations').findOneAndUpdate(
      { _id: id, tenantId },
      { $set: updates },
      { returnDocument: 'after' },
    );
    if (!result) return { ok: false, status: 404, error: 'Location not found' };
    return { ok: true, location: publicLocation(result) };
  } catch (err) {
    if (err.code === 11000) return { ok: false, status: 409, error: 'Location slug already exists' };
    throw err;
  }
}

async function deleteLocation(tenantId, id) {
  const db = getDb();
  const existing = await db.collection('locations').findOne({ _id: id, tenantId });
  if (!existing) return { ok: false, status: 404, error: 'Location not found' };

  const systemIds = (await db.collection('systems')
    .find({ tenantId, locationId: id })
    .project({ _id: 1 })
    .toArray()).map((s) => s._id);

  if (systemIds.length) {
    await db.collection('devices').deleteMany({ tenantId, systemId: { $in: systemIds } });
  }
  await db.collection('systems').deleteMany({ tenantId, locationId: id });
  await db.collection('locations').deleteOne({ _id: id, tenantId });
  return { ok: true };
}

module.exports = {
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
  publicLocation,
};

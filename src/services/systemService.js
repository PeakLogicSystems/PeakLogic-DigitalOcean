'use strict';

const { randomUUID } = require('crypto');
const { getDb } = require('../db/mongo');
const { checkCreateLimit, tenantLimits } = require('./limits');
const { normalizeSlug, isValidSlug } = require('../util/slug');

function now() {
  return new Date();
}

function publicSystem(doc) {
  return {
    id: doc._id,
    tenantId: doc.tenantId,
    locationId: doc.locationId,
    slug: doc.slug,
    name: doc.name,
    description: doc.description ?? null,
    metadata: doc.metadata ?? {},
    scanMs: doc.scanMs,
    runtimeConfig: doc.runtimeConfig ?? {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listSystems(tenantId, locationId) {
  const location = await getDb().collection('locations').findOne({ _id: locationId, tenantId });
  if (!location) return { ok: false, status: 404, error: 'Location not found' };

  const docs = await getDb().collection('systems')
    .find({ tenantId, locationId })
    .sort({ name: 1 })
    .toArray();
  return { ok: true, systems: docs.map(publicSystem) };
}

async function getSystem(tenantId, id) {
  const doc = await getDb().collection('systems').findOne({ _id: id, tenantId });
  return doc ? publicSystem(doc) : null;
}

async function createSystem(tenantId, locationId, input) {
  const name = String(input.name || '').trim();
  let slug = normalizeSlug(input.slug || name);
  if (!name) return { ok: false, status: 400, error: 'name is required' };
  if (!isValidSlug(slug)) return { ok: false, status: 400, error: 'Invalid slug' };

  const db = getDb();
  const location = await db.collection('locations').findOne({ _id: locationId, tenantId });
  if (!location) return { ok: false, status: 404, error: 'Location not found' };

  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  const limits = tenantLimits(tenant);
  const count = await db.collection('systems').countDocuments({ tenantId, locationId });
  const limitCheck = checkCreateLimit(count, limits.systemsPerLocation, 'System');
  if (!limitCheck.ok) return { ok: false, status: 403, error: limitCheck.error };

  const scanMs = Number(input.scanMs);
  const ts = now();
  const doc = {
    _id: randomUUID(),
    tenantId,
    locationId,
    slug,
    name,
    description: input.description ? String(input.description) : null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    scanMs: Number.isFinite(scanMs) && scanMs > 0 ? scanMs : 100,
    runtimeConfig: input.runtimeConfig && typeof input.runtimeConfig === 'object' ? input.runtimeConfig : {},
    createdAt: ts,
    updatedAt: ts,
  };

  try {
    await db.collection('systems').insertOne(doc);
  } catch (err) {
    if (err.code === 11000) return { ok: false, status: 409, error: 'System slug already exists' };
    throw err;
  }

  return { ok: true, system: publicSystem(doc) };
}

async function updateSystem(tenantId, id, input) {
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
  if (input.scanMs !== undefined) {
    const scanMs = Number(input.scanMs);
    if (!Number.isFinite(scanMs) || scanMs <= 0) return { ok: false, status: 400, error: 'scanMs must be positive' };
    updates.scanMs = scanMs;
  }
  if (input.runtimeConfig !== undefined) {
    updates.runtimeConfig = input.runtimeConfig && typeof input.runtimeConfig === 'object' ? input.runtimeConfig : {};
  }

  try {
    const result = await getDb().collection('systems').findOneAndUpdate(
      { _id: id, tenantId },
      { $set: updates },
      { returnDocument: 'after' },
    );
    if (!result) return { ok: false, status: 404, error: 'System not found' };
    return { ok: true, system: publicSystem(result) };
  } catch (err) {
    if (err.code === 11000) return { ok: false, status: 409, error: 'System slug already exists' };
    throw err;
  }
}

async function deleteSystem(tenantId, id) {
  const db = getDb();
  const result = await db.collection('systems').deleteOne({ _id: id, tenantId });
  if (!result.deletedCount) return { ok: false, status: 404, error: 'System not found' };
  await db.collection('devices').deleteMany({ tenantId, systemId: id });
  return { ok: true };
}

module.exports = {
  listSystems,
  getSystem,
  createSystem,
  updateSystem,
  deleteSystem,
  publicSystem,
};

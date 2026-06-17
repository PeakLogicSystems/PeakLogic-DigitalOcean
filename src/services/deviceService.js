'use strict';

const { randomUUID } = require('crypto');
const { getDb } = require('../db/mongo');
const { checkCreateLimit, tenantLimits } = require('./limits');
const { normalizeSlug, isValidSlug } = require('../util/slug');

function now() {
  return new Date();
}

function publicDevice(doc) {
  return {
    id: doc._id,
    tenantId: doc.tenantId,
    systemId: doc.systemId,
    slug: doc.slug,
    name: doc.name,
    driverType: doc.driverType,
    driverConfig: doc.driverConfig ?? {},
    templateId: doc.templateId ?? null,
    enabled: doc.enabled,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listDevices(tenantId, systemId) {
  const system = await getDb().collection('systems').findOne({ _id: systemId, tenantId });
  if (!system) return { ok: false, status: 404, error: 'System not found' };

  const docs = await getDb().collection('devices')
    .find({ tenantId, systemId })
    .sort({ name: 1 })
    .toArray();
  return { ok: true, devices: docs.map(publicDevice) };
}

async function getDevice(tenantId, id) {
  const doc = await getDb().collection('devices').findOne({ _id: id, tenantId });
  return doc ? publicDevice(doc) : null;
}

async function createDevice(tenantId, systemId, input) {
  const name = String(input.name || '').trim();
  let slug = normalizeSlug(input.slug || name);
  if (!name) return { ok: false, status: 400, error: 'name is required' };
  if (!isValidSlug(slug)) return { ok: false, status: 400, error: 'Invalid slug' };

  const db = getDb();
  const system = await db.collection('systems').findOne({ _id: systemId, tenantId });
  if (!system) return { ok: false, status: 404, error: 'System not found' };

  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  const limits = tenantLimits(tenant);
  const count = await db.collection('devices').countDocuments({ tenantId, systemId });
  const limitCheck = checkCreateLimit(count, limits.devicesPerSystem, 'Device');
  if (!limitCheck.ok) return { ok: false, status: 403, error: limitCheck.error };

  const ts = now();
  const doc = {
    _id: randomUUID(),
    tenantId,
    systemId,
    slug,
    name,
    driverType: String(input.driverType || 'modbus_rtu'),
    driverConfig: input.driverConfig && typeof input.driverConfig === 'object' ? input.driverConfig : {},
    templateId: input.templateId ? String(input.templateId) : null,
    enabled: input.enabled !== false,
    createdAt: ts,
    updatedAt: ts,
  };

  try {
    await db.collection('devices').insertOne(doc);
  } catch (err) {
    if (err.code === 11000) return { ok: false, status: 409, error: 'Device slug already exists' };
    throw err;
  }

  return { ok: true, device: publicDevice(doc) };
}

async function updateDevice(tenantId, id, input) {
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
  if (input.driverType !== undefined) updates.driverType = String(input.driverType);
  if (input.driverConfig !== undefined) {
    updates.driverConfig = input.driverConfig && typeof input.driverConfig === 'object' ? input.driverConfig : {};
  }
  if (input.templateId !== undefined) updates.templateId = input.templateId ? String(input.templateId) : null;
  if (input.enabled !== undefined) updates.enabled = Boolean(input.enabled);

  try {
    const result = await getDb().collection('devices').findOneAndUpdate(
      { _id: id, tenantId },
      { $set: updates },
      { returnDocument: 'after' },
    );
    if (!result) return { ok: false, status: 404, error: 'Device not found' };
    return { ok: true, device: publicDevice(result) };
  } catch (err) {
    if (err.code === 11000) return { ok: false, status: 409, error: 'Device slug already exists' };
    throw err;
  }
}

async function deleteDevice(tenantId, id) {
  const result = await getDb().collection('devices').deleteOne({ _id: id, tenantId });
  if (!result.deletedCount) return { ok: false, status: 404, error: 'Device not found' };
  return { ok: true };
}

module.exports = {
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  publicDevice,
};

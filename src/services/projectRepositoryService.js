'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db/mongo');
const { exportFilename } = require('../project/estFile');
const locationService = require('./locationService');

const COLLECTION = 'project_repository';

function safeSlug(name) {
  const base = String(name || 'project').trim().replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'project';
  return base.toLowerCase();
}

function tenantKey(tenantId) {
  return String(tenantId);
}

function normalizeLocationId(value) {
  const id = String(value || '').trim();
  return id || null;
}

function publicEntry(doc, locationMap = {}) {
  const locationId = doc.locationId || null;
  const loc = locationId ? locationMap[locationId] : null;
  return {
    id: String(doc._id),
    slug: doc.slug,
    name: doc.name,
    description: doc.description || '',
    locationId,
    locationSlug: loc?.slug || null,
    locationName: loc?.name || null,
    updatedAt: doc.updatedAt || doc.publishedAt || null,
    version: doc.version || 1,
    source: 'cloud',
  };
}

async function resolveLocationId(tenantId, locationId) {
  const normalized = normalizeLocationId(locationId);
  if (!normalized) return null;
  const loc = await locationService.getLocation(tenantId, normalized);
  if (!loc) {
    throw Object.assign(new Error('Location not found'), { status: 404 });
  }
  return normalized;
}

async function locationMapForTenant(tenantId, docs) {
  const ids = [...new Set(docs.map((d) => d.locationId).filter(Boolean))];
  if (!ids.length) return {};
  const locations = await locationService.listLocations(tenantId);
  return Object.fromEntries(locations.filter((l) => ids.includes(l.id)).map((l) => [l.id, l]));
}

/**
 * @param {string} tenantId
 * @param {{ locationId?: string|null, unboundOnly?: boolean }} [opts]
 */
async function listProjects(tenantId, opts = {}) {
  const filter = { tenantId: tenantKey(tenantId) };
  if (opts.unboundOnly) {
    filter.locationId = null;
  } else if (opts.locationId != null && String(opts.locationId).trim()) {
    filter.locationId = normalizeLocationId(opts.locationId);
  }
  const rows = await getDb().collection(COLLECTION)
    .find(filter)
    .sort({ updatedAt: -1 })
    .toArray();
  const locationMap = await locationMapForTenant(tenantId, rows);
  return rows.map((doc) => publicEntry(doc, locationMap));
}

/**
 * @param {string} tenantId
 * @param {string} idOrSlug
 * @param {{ locationId?: string|null }} [opts]
 */
async function loadProjectDoc(tenantId, idOrSlug, opts = {}) {
  const tid = tenantKey(tenantId);
  const key = String(idOrSlug || '').trim();
  const locationId = opts.locationId != null ? normalizeLocationId(opts.locationId) : undefined;
  let row = null;

  if (ObjectId.isValid(key)) {
    row = await getDb().collection(COLLECTION).findOne({ tenantId: tid, _id: new ObjectId(key) });
  }
  if (!row) {
    const slugFilter = { tenantId: tid, slug: safeSlug(key) };
    if (locationId !== undefined) slugFilter.locationId = locationId;
    row = await getDb().collection(COLLECTION).findOne(slugFilter);
  }
  if (!row) throw Object.assign(new Error(`Project not in cloud repository: ${key}`), { status: 404 });
  return row;
}

async function publishProject(tenantId, name, doc, meta = {}) {
  const tid = tenantKey(tenantId);
  const locationId = await resolveLocationId(tenantId, meta.locationId);
  const projectName = String(name || doc?.project?.name || 'project').trim() || 'project';
  const slug = safeSlug(meta.slug || projectName);
  const now = new Date();
  const existing = await getDb().collection(COLLECTION).findOne({
    tenantId: tid,
    slug,
    locationId,
  });
  const payload = {
    tenantId: tid,
    locationId,
    slug,
    name: projectName,
    description: String(meta.description || '').trim(),
    estDoc: { ...doc, project: { ...(doc.project || {}), name: projectName } },
    updatedAt: now,
    publishedAt: existing?.publishedAt || now,
    publishedBy: meta.publishedBy || null,
    version: (existing?.version || 0) + 1,
  };
  if (existing) {
    await getDb().collection(COLLECTION).updateOne({ _id: existing._id }, { $set: payload });
    const updated = await getDb().collection(COLLECTION).findOne({ _id: existing._id });
    const locationMap = await locationMapForTenant(tenantId, [updated]);
    return {
      entry: publicEntry(updated, locationMap),
      filename: exportFilename(projectName),
    };
  }
  const ins = await getDb().collection(COLLECTION).insertOne(payload);
  const created = await getDb().collection(COLLECTION).findOne({ _id: ins.insertedId });
  const locationMap = await locationMapForTenant(tenantId, [created]);
  return {
    entry: publicEntry(created, locationMap),
    filename: exportFilename(projectName),
  };
}

async function deleteProject(tenantId, idOrSlug, opts = {}) {
  const row = await loadProjectDoc(tenantId, idOrSlug, opts);
  await getDb().collection(COLLECTION).deleteOne({ _id: row._id });
  return { ok: true };
}

async function deleteProjectsForLocation(tenantId, locationId) {
  await getDb().collection(COLLECTION).deleteMany({
    tenantId: tenantKey(tenantId),
    locationId: normalizeLocationId(locationId),
  });
}

async function countProjectsForLocation(tenantId, locationId) {
  return getDb().collection(COLLECTION).countDocuments({
    tenantId: tenantKey(tenantId),
    locationId: normalizeLocationId(locationId),
  });
}

module.exports = {
  listProjects,
  loadProjectDoc,
  publishProject,
  deleteProject,
  deleteProjectsForLocation,
  countProjectsForLocation,
  safeSlug,
  normalizeLocationId,
};

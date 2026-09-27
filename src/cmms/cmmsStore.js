'use strict';

const { randomUUID } = require('crypto');
const { getDb } = require('../db/mongo');

const COLLECTIONS = {
  facilities: 'cmms_facilities',
  assets: 'cmms_assets',
  workorders: 'cmms_workorders',
};

function col(name) {
  return getDb().collection(COLLECTIONS[name]);
}

function tenantFilter(tenantId) {
  return { tenantId };
}

async function listFacilities(tenantId) {
  return col('facilities').find(tenantFilter(tenantId)).sort({ name: 1 }).toArray();
}

async function createFacility(tenantId, input) {
  const doc = {
    _id: randomUUID(),
    tenantId,
    name: String(input.name || '').trim(),
    address: String(input.address || '').trim(),
    description: String(input.description || '').trim(),
    createdAt: new Date(),
  };
  if (!doc.name) return { ok: false, error: 'Name is required' };
  await col('facilities').insertOne(doc);
  return { ok: true, facility: doc };
}

async function listAssets(tenantId) {
  return col('assets').find(tenantFilter(tenantId)).sort({ name: 1 }).toArray();
}

async function createAsset(tenantId, input) {
  const doc = {
    _id: randomUUID(),
    tenantId,
    name: String(input.name || '').trim(),
    facilityId: input.facilityId || null,
    serialNumber: String(input.serialNumber || '').trim(),
    status: input.status || 'active',
    createdAt: new Date(),
  };
  if (!doc.name) return { ok: false, error: 'Name is required' };
  await col('assets').insertOne(doc);
  return { ok: true, asset: doc };
}

async function listWorkOrders(tenantId) {
  return col('workorders').find(tenantFilter(tenantId)).sort({ createdAt: -1 }).toArray();
}

async function nextWoNumber(tenantId) {
  const year = new Date().getFullYear();
  const count = await col('workorders').countDocuments({ tenantId });
  return `WO-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function createWorkOrder(tenantId, input, actor) {
  const doc = {
    _id: randomUUID(),
    tenantId,
    woNumber: await nextWoNumber(tenantId),
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    facilityId: input.facilityId || null,
    assetId: input.assetId || null,
    priority: ['low', 'medium', 'high', 'critical'].includes(input.priority) ? input.priority : 'medium',
    status: 'open',
    assignedTo: input.assignedTo || null,
    createdBy: actor?.email || 'system',
    source: input.source || 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  if (!doc.title) return { ok: false, error: 'Title is required' };
  await col('workorders').insertOne(doc);
  return { ok: true, workOrder: doc };
}

async function dashboardStats(tenantId) {
  const filter = tenantFilter(tenantId);
  const [openCount, totalAssets, totalFacilities, totalWorkOrders] = await Promise.all([
    col('workorders').countDocuments({ ...filter, status: { $in: ['open', 'in-progress'] } }),
    col('assets').countDocuments(filter),
    col('facilities').countDocuments(filter),
    col('workorders').countDocuments(filter),
  ]);
  return { openCount, totalAssets, totalFacilities, totalWorkOrders };
}

module.exports = {
  COLLECTIONS,
  listFacilities,
  createFacility,
  listAssets,
  createAsset,
  listWorkOrders,
  createWorkOrder,
  dashboardStats,
};

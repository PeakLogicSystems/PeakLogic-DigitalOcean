'use strict';

const { getDb } = require('../db/mongo');
const { normalizeBillingRecord, summarizeBillingRecord } = require('./connectivityBillingSchema');

const COLLECTION = 'connectivity_billing';

async function collection() {
  return getDb().collection(COLLECTION);
}

async function getById(id) {
  const row = await (await collection()).findOne({ id });
  return summarizeBillingRecord(row);
}

async function getBySystemId(tenantId, systemId) {
  const row = await (await collection()).findOne({ tenantId, systemId });
  return summarizeBillingRecord(row);
}

async function list(filter = {}) {
  const query = {};
  if (filter.tenantId) query.tenantId = String(filter.tenantId).trim();
  if (filter.systemId) query.systemId = String(filter.systemId).trim();
  if (filter.status) query.status = String(filter.status).trim().toLowerCase();
  if (filter.deviceId) query.deviceId = String(filter.deviceId).trim();
  if (filter.dueBefore) {
    query.status = 'active';
    query.renewalAt = { $lte: String(filter.dueBefore) };
  }

  const rows = await (await collection()).find(query).sort({ renewalAt: 1, updatedAt: -1 }).toArray();
  return rows.map((r) => summarizeBillingRecord(r));
}

async function upsert(record) {
  const doc = normalizeBillingRecord(record);
  await (await collection()).updateOne(
    { tenantId: doc.tenantId, systemId: doc.systemId },
    { $set: doc },
    { upsert: true },
  );
  return summarizeBillingRecord(doc);
}

async function update(id, patch, prev = null) {
  const existing = prev || await getById(id);
  if (!existing) return null;
  const doc = normalizeBillingRecord({ ...existing, ...patch, id: existing.id }, existing);
  await (await collection()).updateOne({ id }, { $set: doc });
  return summarizeBillingRecord(doc);
}

async function remove(id) {
  const res = await (await collection()).deleteOne({ id });
  return res.deletedCount > 0;
}

module.exports = {
  COLLECTION,
  getById,
  getBySystemId,
  list,
  upsert,
  update,
  remove,
};

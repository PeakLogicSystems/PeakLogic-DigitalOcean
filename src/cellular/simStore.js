'use strict';

const { MongoClient } = require('mongodb');
const persistence = require('../persistence');
const { CONFIG_URI, CONFIG_DB } = require('../config');
const { normalizeSimRecord, summarizeSim, normalizeIccid } = require('./simRecordSchema');

const FALLBACK_FILE = 'cellular_sims.json';
const COLLECTION = String(process.env.PEAKLOGIC_CELLULAR_SIMS_COLLECTION || 'cellular_sims').trim() || 'cellular_sims';

let client = null;
let collection = null;
let connecting = null;
let forceFallback = false;
const memoryRows = [];

function uri() {
  const raw = String(CONFIG_URI || '').trim();
  return raw && raw !== 'memory' ? raw : '';
}

function useFallback() {
  return forceFallback || !uri();
}

function loadFallbackStore() {
  const raw = persistence.readJson(FALLBACK_FILE, { sims: [] });
  return Array.isArray(raw.sims) ? raw.sims : [];
}

function saveFallbackStore(rows) {
  persistence.writeJson(FALLBACK_FILE, { sims: rows });
}

function readFallbackRows() {
  const src = memoryRows.length ? memoryRows : loadFallbackStore();
  return src.map((r) => ({ ...r, metadata: r.metadata ? { ...r.metadata } : {} }));
}

function writeFallbackRows(rows) {
  memoryRows.length = 0;
  memoryRows.push(...rows);
  saveFallbackStore(rows);
}

async function ensureCollection() {
  if (collection) return collection;
  if (useFallback()) return null;
  if (connecting) {
    await connecting;
    return collection;
  }
  connecting = (async () => {
    client = new MongoClient(uri(), { maxPoolSize: 4 });
    await client.connect();
    collection = client.db(CONFIG_DB).collection(COLLECTION);
    await collection.createIndex({ id: 1 }, { unique: true });
    await collection.createIndex({ iccid: 1, vendor: 1 }, { unique: true });
    await collection.createIndex({ tenantId: 1, updatedAt: -1 });
    await collection.createIndex({ deviceId: 1 });
    await collection.createIndex({ status: 1 });
    return collection;
  })();
  try {
    await connecting;
    return collection;
  } finally {
    connecting = null;
  }
}

function status() {
  return {
    backend: useFallback() ? 'json' : 'mongo',
    collection: COLLECTION,
    db: CONFIG_DB,
    count: memoryRows.length || loadFallbackStore().length,
  };
}

async function close() {
  if (client) await client.close().catch(() => {});
  client = null;
  collection = null;
  connecting = null;
}

async function list(filter = {}) {
  const query = {};
  if (filter.vendor) query.vendor = String(filter.vendor).trim().toLowerCase();
  if (filter.tenantId) query.tenantId = String(filter.tenantId).trim();
  if (filter.deviceId) query.deviceId = String(filter.deviceId).trim();
  if (filter.status) query.status = String(filter.status).trim().toLowerCase();

  const col = await ensureCollection();
  if (col) {
    const rows = await col.find(query).sort({ updatedAt: -1 }).toArray();
    return rows.map((r) => summarizeSim(r));
  }
  return readFallbackRows()
    .filter((r) => {
      if (filter.vendor && r.vendor !== filter.vendor) return false;
      if (filter.tenantId && r.tenantId !== filter.tenantId) return false;
      if (filter.deviceId && r.deviceId !== filter.deviceId) return false;
      if (filter.status && r.status !== filter.status) return false;
      return true;
    })
    .map((r) => summarizeSim(r));
}

async function get(id) {
  const col = await ensureCollection();
  if (col) {
    const row = await col.findOne({ id });
    return summarizeSim(row);
  }
  return summarizeSim(readFallbackRows().find((r) => r.id === id) || null);
}

async function findByIccid(vendor, iccid) {
  const col = await ensureCollection();
  const v = String(vendor).trim().toLowerCase();
  const i = normalizeIccid(iccid);
  if (col) {
    const row = await col.findOne({ vendor: v, iccid: i });
    return summarizeSim(row);
  }
  return summarizeSim(readFallbackRows().find((r) => r.vendor === v && normalizeIccid(r.iccid) === i) || null);
}

async function findByIccidAny(iccid) {
  const i = normalizeIccid(iccid);
  if (!i) return null;
  const col = await ensureCollection();
  if (col) {
    const row = await col.findOne({ iccid: i });
    return summarizeSim(row);
  }
  return summarizeSim(readFallbackRows().find((r) => normalizeIccid(r.iccid) === i) || null);
}

async function upsertFromVendor(input, prev = null) {
  const doc = normalizeSimRecord(input, prev);
  const col = await ensureCollection();
  if (col) {
    await col.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
    return summarizeSim(doc);
  }
  const rows = readFallbackRows();
  const idx = rows.findIndex((r) => r.id === doc.id);
  if (idx >= 0) rows[idx] = doc;
  else rows.unshift(doc);
  writeFallbackRows(rows);
  return summarizeSim(doc);
}

async function update(id, patch) {
  const prev = await get(id);
  if (!prev) return null;
  const doc = normalizeSimRecord({ ...prev, ...patch, id: prev.id }, prev);
  const col = await ensureCollection();
  if (col) {
    await col.updateOne({ id }, { $set: doc });
    return summarizeSim(doc);
  }
  const rows = readFallbackRows();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  rows[idx] = doc;
  writeFallbackRows(rows);
  return summarizeSim(doc);
}

async function remove(id) {
  const col = await ensureCollection();
  if (col) {
    const res = await col.deleteOne({ id });
    return res.deletedCount > 0;
  }
  const rows = readFallbackRows();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  writeFallbackRows(next);
  return true;
}

function resetFallbackForTests(rows = []) {
  forceFallback = true;
  memoryRows.length = 0;
  memoryRows.push(...rows.map((r) => ({ ...r })));
  saveFallbackStore(rows);
}

module.exports = {
  status,
  close,
  list,
  get,
  findByIccid,
  findByIccidAny,
  upsertFromVendor,
  update,
  remove,
  resetFallbackForTests,
};

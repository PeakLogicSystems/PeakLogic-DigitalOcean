'use strict';

const { MongoClient } = require('mongodb');
const persistence = require('../persistence');
const { CONFIG_URI, CONFIG_DB } = require('../config');
const { normalizeSimInput, summarizeSim } = require('./simSchema');

const FALLBACK_FILE = 'cloud_sims.json';
const COLLECTION = String(process.env.PEAKLOGIC_CLOUD_SIMS_COLLECTION || 'cloud_sims').trim() || 'cloud_sims';

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
  return src.map((r) => ({ ...r, config: r.config ? { ...r.config } : {} }));
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
    await collection.createIndex({ tenantId: 1, updatedAt: -1 });
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

async function list() {
  const col = await ensureCollection();
  if (col) {
    const rows = await col.find({}).sort({ updatedAt: -1 }).toArray();
    return rows.map((r) => summarizeSim(r));
  }
  return readFallbackRows().map((r) => summarizeSim(r));
}

async function get(id) {
  const col = await ensureCollection();
  if (col) {
    const row = await col.findOne({ id });
    return summarizeSim(row);
  }
  return summarizeSim(readFallbackRows().find((r) => r.id === id) || null);
}

async function create(input) {
  const doc = normalizeSimInput(input);
  const col = await ensureCollection();
  if (col) {
    await col.insertOne(doc);
    return summarizeSim(doc);
  }
  const rows = readFallbackRows();
  if (rows.some((r) => r.id === doc.id)) {
    throw Object.assign(new Error('sim id conflict'), { status: 409 });
  }
  if (rows.some((r) => r.mqttDeviceId === doc.mqttDeviceId && r.tenantId === doc.tenantId)) {
    throw Object.assign(new Error('mqttDeviceId already used for tenant'), { status: 409 });
  }
  rows.unshift(doc);
  writeFallbackRows(rows);
  return summarizeSim(doc);
}

async function update(id, patch) {
  const prev = await get(id);
  if (!prev) return null;
  const doc = normalizeSimInput({ ...prev, ...patch, id: prev.id, status: patch.status ?? prev.status }, prev);
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

/** Test helper — reset in-memory/fallback state without touching Mongo. */
function resetFallbackForTests(rows = []) {
  forceFallback = true;
  memoryRows.length = 0;
  memoryRows.push(...rows.map((r) => ({ ...r })));
}

module.exports = {
  status,
  close,
  list,
  get,
  create,
  update,
  remove,
  resetFallbackForTests,
};

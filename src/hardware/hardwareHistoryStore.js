'use strict';

const { MongoClient } = require('mongodb');
const persistence = require('../persistence');
const { DEFAULT_MONGO_LOGGER } = require('../settings/mongoLoggerSettings');
const { profileFromRegistryDev, inferSwapType } = require('./deviceProfile');

const FALLBACK_FILE = 'hardware_assignments.json';
const DEFAULT_COLLECTION = 'hardware_assignments';

let client = null;
let collection = null;
let connecting = null;
let override = null;
let memoryMode = false;
let forceFallback = false;
const memoryRows = [];

function uri() {
  return override?.uri || process.env.MONGODB_URI || process.env.MONGO_URL || '';
}

function dbName() {
  return override?.db || process.env.MONGODB_DB || DEFAULT_MONGO_LOGGER.db;
}

function collectionName() {
  return override?.collection || process.env.MONGODB_HARDWARE_COLLECTION || DEFAULT_COLLECTION;
}

function useMemory() {
  return forceFallback || memoryMode || uri() === 'memory' || !uri();
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;
  const installedAt = row.installedAt instanceof Date
    ? row.installedAt.toISOString()
    : String(row.installedAt || '');
  const removedAt = row.removedAt == null
    ? null
    : (row.removedAt instanceof Date ? row.removedAt.toISOString() : String(row.removedAt));
  return {
    id: String(row._id || row.id || ''),
    positionId: String(row.positionId || ''),
    positionName: row.positionName || null,
    deviceId: String(row.deviceId || ''),
    serialNumber: String(row.serialNumber || ''),
    vendor: String(row.vendor || ''),
    model: String(row.model || ''),
    platform: String(row.platform || ''),
    driverType: String(row.driverType || ''),
    swapType: String(row.swapType || 'replacement'),
    installedAt,
    removedAt,
    note: String(row.note || ''),
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
  };
}

function loadFallbackStore() {
  const raw = persistence.readJson(FALLBACK_FILE, { assignments: [] });
  return Array.isArray(raw.assignments) ? raw.assignments : [];
}

function saveFallbackStore(rows) {
  persistence.writeJson(FALLBACK_FILE, { assignments: rows });
}

function readAllRows() {
  if (useMemory()) {
    const src = memoryRows.length ? memoryRows : loadFallbackStore();
    return src.map((r) => ({ ...r, meta: r.meta ? { ...r.meta } : {} }));
  }
  return null;
}

async function ensureCollection() {
  if (collection) return collection;
  if (useMemory()) return null;
  if (connecting) {
    await connecting;
    return collection;
  }
  connecting = (async () => {
    client = new MongoClient(uri(), { maxPoolSize: 6 });
    await client.connect();
    collection = client.db(dbName()).collection(collectionName());
    await collection.createIndex({ positionId: 1, installedAt: -1 });
    await collection.createIndex({ serialNumber: 1, installedAt: -1 });
    await collection.createIndex({ deviceId: 1, installedAt: -1 });
    await collection.createIndex({ positionId: 1, removedAt: 1 });
    return collection;
  })();
  try {
    await connecting;
    return collection;
  } finally {
    connecting = null;
  }
}

async function setConfig(cfg) {
  if (cfg && typeof cfg === 'object' && cfg.uri) {
    override = { ...cfg };
    forceFallback = false;
  } else {
    override = null;
    forceFallback = true;
  }
  if (client) {
    await client.close().catch(() => {});
    client = null;
    collection = null;
  }
  if (!useMemory()) await ensureCollection().catch(() => {});
}

function status() {
  return {
    enabled: !useMemory(),
    uri: !forceFallback && uri() ? uri().replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@') : '',
    db: dbName(),
    collection: collectionName(),
    fallback: useMemory(),
  };
}

async function close() {
  if (client) await client.close().catch(() => {});
  client = null;
  collection = null;
  connecting = null;
}

function nextFallbackId() {
  return `hw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function assignmentFields(doc) {
  const prof = doc?.profile && typeof doc.profile === 'object' ? doc.profile : (doc || {});
  return {
    deviceId: prof.deviceId || '',
    serialNumber: prof.serialNumber || '',
    vendor: prof.vendor || '',
    model: prof.model || '',
    platform: prof.platform || '',
    driverType: prof.driverType || '',
    meta: prof.meta && typeof prof.meta === 'object' ? prof.meta : {},
  };
}

async function insertAssignment(doc) {
  const fields = assignmentFields(doc);
  const row = {
    positionId: doc.positionId,
    positionName: doc.positionName || null,
    ...fields,
    swapType: doc.swapType || 'replacement',
    installedAt: doc.installedAt instanceof Date ? doc.installedAt : new Date(doc.installedAt || Date.now()),
    removedAt: doc.removedAt == null ? null : new Date(doc.removedAt),
    note: doc.note ? String(doc.note).trim() : '',
  };
  const col = await ensureCollection();
  if (col) {
    const res = await col.insertOne(row);
    return normalizeRow({ ...row, _id: res.insertedId });
  }
  const stored = readAllRows();
  const out = { ...row, id: nextFallbackId(), _id: null };
  stored.unshift(out);
  if (useMemory()) {
    memoryRows.length = 0;
    memoryRows.push(...stored);
  }
  saveFallbackStore(stored);
  return normalizeRow(out);
}

async function closeCurrentAssignment(positionId, removedAt = new Date()) {
  const col = await ensureCollection();
  if (col) {
    await col.updateMany(
      { positionId, removedAt: null },
      { $set: { removedAt } },
    );
    return;
  }
  const stored = readAllRows();
  let changed = false;
  for (const row of stored) {
    if (row.positionId === positionId && row.removedAt == null) {
      row.removedAt = removedAt instanceof Date ? removedAt.toISOString() : removedAt;
      changed = true;
    }
  }
  if (changed) {
    if (useMemory()) {
      memoryRows.length = 0;
      memoryRows.push(...stored);
    }
    saveFallbackStore(stored);
  }
}

async function recordAssignment({
  positionId,
  positionName,
  profile,
  swapType,
  note,
  installedAt,
}) {
  const pos = String(positionId || '').trim();
  if (!pos) throw Object.assign(new Error('positionId required'), { status: 400 });
  const prof = profile && typeof profile === 'object' ? profile : {};
  await closeCurrentAssignment(pos, installedAt ? new Date(installedAt) : new Date());
  return insertAssignment({
    positionId: pos,
    positionName: positionName ? String(positionName).trim() : null,
    profile: prof,
    swapType: swapType || 'commission',
    installedAt: installedAt ? new Date(installedAt) : new Date(),
    removedAt: null,
    note: note ? String(note).trim() : '',
  });
}

async function recordHardwareSwap({
  positionId,
  positionName,
  outgoingDriver,
  outgoingRegistryDev,
  incomingRegistryDev,
  incomingDriver,
  swapType,
  note,
  vendor,
  model,
}) {
  const outgoing = profileFromRegistryDev(outgoingRegistryDev, outgoingDriver);
  const incoming = profileFromRegistryDev(incomingRegistryDev, incomingDriver, { vendor, model });
  const resolvedSwap = inferSwapType(outgoing, incoming, swapType);
  await closeCurrentAssignment(positionId);
  return insertAssignment({
    positionId,
    positionName: positionName || incomingDriver?.name || null,
    profile: incoming,
    swapType: resolvedSwap,
    note: note ? String(note).trim() : '',
  });
}

async function recordCommission({
  positionId,
  positionName,
  registryDev,
  driver,
  note,
}) {
  const profile = profileFromRegistryDev(registryDev, driver);
  return recordAssignment({
    positionId,
    positionName,
    profile,
    swapType: 'commission',
    note,
  });
}

async function queryRows(filter, limit = 50) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const col = await ensureCollection();
  if (col) {
    const docs = await col.find(filter).sort({ installedAt: -1 }).limit(lim).toArray();
    return docs.map(normalizeRow);
  }
  const stored = readAllRows();
  return stored
    .filter((row) => Object.entries(filter).every(([k, v]) => {
      if (v == null) return row[k] == null;
      return row[k] === v;
    }))
    .sort((a, b) => String(b.installedAt).localeCompare(String(a.installedAt)))
    .slice(0, lim)
    .map(normalizeRow);
}

async function listByPosition(positionId, opts = {}) {
  const pos = String(positionId || '').trim();
  if (!pos) return [];
  const col = await ensureCollection();
  if (col) {
    const q = { positionId: pos };
    if (opts.currentOnly) q.removedAt = null;
    return queryRows(q, opts.limit);
  }
  const stored = readAllRows().filter((r) => r.positionId === pos);
  const filtered = opts.currentOnly ? stored.filter((r) => r.removedAt == null) : stored;
  return filtered
    .sort((a, b) => String(b.installedAt).localeCompare(String(a.installedAt)))
    .slice(0, Math.min(Number(opts.limit) || 50, 500))
    .map(normalizeRow);
}

async function listRecent(opts = {}) {
  const lim = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const col = await ensureCollection();
  if (col) {
    const docs = await col.find({}).sort({ installedAt: -1 }).limit(lim).toArray();
    return docs.map(normalizeRow);
  }
  return readAllRows()
    .sort((a, b) => String(b.installedAt).localeCompare(String(a.installedAt)))
    .slice(0, lim)
    .map(normalizeRow);
}

async function listBySerial(serialNumber, opts = {}) {
  const sn = String(serialNumber || '').trim().toLowerCase();
  if (!sn) return [];
  const col = await ensureCollection();
  if (col) {
    const docs = await col.find({ serialNumber: new RegExp(`^${sn}$`, 'i') })
      .sort({ installedAt: -1 })
      .limit(Math.min(Number(opts.limit) || 50, 500))
      .toArray();
    return docs.map(normalizeRow);
  }
  return readAllRows()
    .filter((r) => String(r.serialNumber || '').toLowerCase() === sn)
    .sort((a, b) => String(b.installedAt).localeCompare(String(a.installedAt)))
    .slice(0, Math.min(Number(opts.limit) || 50, 500))
    .map(normalizeRow);
}

async function getCurrentAssignment(positionId) {
  const rows = await listByPosition(positionId, { currentOnly: true, limit: 1 });
  return rows[0] || null;
}

async function importFromDriverHistories(drivers) {
  const list = Array.isArray(drivers) ? drivers : [];
  let imported = 0;
  for (const drv of list) {
    if (drv.type !== 'mqtt_parc') continue;
    const positionId = drv.id;
    const current = await getCurrentAssignment(positionId);
    if (current) continue;
    const history = Array.isArray(drv.hardwareHistory) ? drv.hardwareHistory : [];
    for (const h of [...history].reverse()) {
      await insertAssignment({
        positionId,
        positionName: drv.name || null,
        deviceId: h.deviceId || '',
        serialNumber: h.ateccSerial || h.serialNumber || '',
        vendor: h.vendor || '',
        model: h.model || '',
        platform: h.platform || '',
        driverType: drv.type,
        swapType: h.swapType || 'replacement',
        installedAt: h.installedAt ? new Date(h.installedAt) : new Date(h.replacedAt || Date.now()),
        removedAt: h.removedAt ? new Date(h.removedAt) : new Date(h.replacedAt || Date.now()),
        note: h.note || 'imported from driver history',
        meta: h.meta || {},
      });
      imported += 1;
    }
    await recordCommission({
      positionId,
      positionName: drv.name,
      registryDev: { deviceId: drv.deviceId, ateccSerial: drv.ateccSerial },
      driver: drv,
      note: history.length ? 'imported current assignment' : 'imported from driver config',
    });
    imported += 1;
  }
  return { imported };
}

module.exports = {
  setConfig,
  status,
  close,
  recordAssignment,
  recordCommission,
  recordHardwareSwap,
  listByPosition,
  listBySerial,
  listRecent,
  getCurrentAssignment,
  importFromDriverHistories,
};

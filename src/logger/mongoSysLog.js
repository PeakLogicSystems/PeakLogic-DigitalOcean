'use strict';

const os = require('os');
const { MongoClient } = require('mongodb');
const persistence = require('../persistence');
const { DEPLOYMENT_MODE, TENANT_ID } = require('../config');
const { DEFAULT_MONGO_LOGGER } = require('../settings/mongoLoggerSettings');
const { getContext } = require('./sysLogContext');

const FALLBACK_FILE = 'sys_log.json';
const DEFAULT_COLLECTION = 'sys_log';
const FALLBACK_MAX = 2000;
const LEVELS = new Set(['error', 'warn', 'info', 'maintenance']);

let client = null;
let collection = null;
let connecting = null;
let override = null;
let forceFallback = false;
const memoryRows = [];

function uri() {
  return override?.uri || process.env.MONGODB_URI || process.env.MONGO_URL || '';
}

function dbName() {
  return override?.db || process.env.MONGODB_DB || DEFAULT_MONGO_LOGGER.db;
}

function collectionName() {
  return override?.sysLogCollection
    || process.env.MONGODB_SYSLOG_COLLECTION
    || DEFAULT_COLLECTION;
}

function useFallback() {
  return forceFallback || uri() === 'memory' || !uri();
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null;
  const id = String(user.id || user.userId || '').trim();
  const email = String(user.email || '').trim();
  const name = String(user.name || user.displayName || '').trim();
  const role = String(user.role || '').trim();
  if (!id && !email && !name) return null;
  return {
    id: id || null,
    email: email || null,
    name: name || null,
    role: role || null,
  };
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const at = raw.at instanceof Date ? raw.at.toISOString() : String(raw.at || '');
  return {
    id: String(raw._id || raw.id || ''),
    at,
    level: String(raw.level || 'info'),
    category: String(raw.category || 'general'),
    message: String(raw.message || ''),
    detail: raw.detail && typeof raw.detail === 'object' ? raw.detail : {},
    tenantId: String(raw.tenantId || TENANT_ID),
    deployment: String(raw.deployment || DEPLOYMENT_MODE),
    user: raw.user && typeof raw.user === 'object' ? raw.user : null,
    request: raw.request && typeof raw.request === 'object' ? raw.request : null,
    host: String(raw.host || ''),
    pid: Number.isFinite(raw.pid) ? raw.pid : null,
  };
}

function loadFallbackStore() {
  const raw = persistence.readJson(FALLBACK_FILE, { entries: [] });
  return Array.isArray(raw.entries) ? raw.entries : [];
}

function saveFallbackStore(rows) {
  const trimmed = rows.slice(0, FALLBACK_MAX);
  persistence.writeJson(FALLBACK_FILE, { entries: trimmed });
}

function readFallbackRows() {
  const src = memoryRows.length ? memoryRows : loadFallbackStore();
  return src.map((r) => ({
    ...r,
    detail: r.detail ? { ...r.detail } : {},
    user: r.user ? { ...r.user } : null,
    request: r.request ? { ...r.request } : null,
  }));
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
    collection = client.db(dbName()).collection(collectionName());
    await collection.createIndex({ at: -1 });
    await collection.createIndex({ tenantId: 1, at: -1 });
    await collection.createIndex({ level: 1, category: 1, at: -1 });
    await collection.createIndex({ 'user.id': 1, at: -1 }, { sparse: true });
    const ttlDays = Number(process.env.PEAKLOGIC_SYSLOG_TTL_DAYS || 0);
    if (ttlDays > 0) {
      await collection.createIndex(
        { at: 1 },
        { expireAfterSeconds: Math.floor(ttlDays * 86400) },
      ).catch(() => {});
    }
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
  if (!useFallback()) await ensureCollection().catch(() => {});
}

function status() {
  return {
    enabled: !useFallback(),
    uri: !forceFallback && uri() ? uri().replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@') : '',
    db: dbName(),
    collection: collectionName(),
    fallback: useFallback(),
    tenantId: TENANT_ID,
    deployment: DEPLOYMENT_MODE,
  };
}

async function close() {
  if (client) await client.close().catch(() => {});
  client = null;
  collection = null;
  connecting = null;
}

function buildEntry(opts = {}) {
  const ctx = getContext();
  const level = String(opts.level || 'info').toLowerCase();
  if (!LEVELS.has(level)) {
    throw Object.assign(new Error(`Invalid syslog level: ${level}`), { status: 400 });
  }
  const user = normalizeUser(opts.user || ctx.user);
  const request = opts.request || ctx.request || null;
  return {
    at: opts.at ? new Date(opts.at) : new Date(),
    level,
    category: String(opts.category || 'general').slice(0, 64),
    message: String(opts.message || '').slice(0, 4000),
    detail: opts.detail && typeof opts.detail === 'object' ? opts.detail : {},
    tenantId: String(opts.tenantId || ctx.tenantId || TENANT_ID),
    deployment: String(opts.deployment || ctx.deployment || DEPLOYMENT_MODE),
    user,
    request,
    host: os.hostname(),
    pid: process.pid,
  };
}

async function append(opts = {}) {
  const entry = buildEntry(opts);
  if (!entry.message) return null;

  const col = await ensureCollection();
  if (col) {
    const res = await col.insertOne(entry);
    return normalizeEntry({ ...entry, _id: res.insertedId });
  }

  const stored = readFallbackRows();
  const out = { ...entry, id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, at: entry.at.toISOString() };
  stored.unshift(out);
  memoryRows.length = 0;
  memoryRows.push(...stored.slice(0, FALLBACK_MAX));
  saveFallbackStore(memoryRows);
  return normalizeEntry(out);
}

function appendFireAndForget(opts) {
  append(opts).catch((e) => {
    const original = console.error.bind(console);
    original('[sys-log] append failed:', e.message || e);
  });
}

function error(category, message, detail, extra) {
  appendFireAndForget({ level: 'error', category, message, detail, ...extra });
}

function warn(category, message, detail, extra) {
  appendFireAndForget({ level: 'warn', category, message, detail, ...extra });
}

function info(category, message, detail, extra) {
  appendFireAndForget({ level: 'info', category, message, detail, ...extra });
}

function maintenance(category, message, detail, extra) {
  appendFireAndForget({ level: 'maintenance', category, message, detail, ...extra });
}

async function query(filter = {}, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const col = await ensureCollection();
  if (col) {
    const q = { ...filter };
    if (opts.since) {
      q.at = { ...(q.at || {}), $gte: new Date(opts.since) };
    }
    if (opts.until) {
      q.at = { ...(q.at || {}), $lte: new Date(opts.until) };
    }
    const docs = await col.find(q).sort({ at: -1 }).limit(limit).toArray();
    return docs.map(normalizeEntry);
  }
  let rows = readFallbackRows();
  if (filter.tenantId) rows = rows.filter((r) => r.tenantId === filter.tenantId);
  if (filter.level) rows = rows.filter((r) => r.level === filter.level);
  if (filter.category) rows = rows.filter((r) => r.category === filter.category);
  if (opts.since) {
    const sinceMs = Date.parse(opts.since);
    if (Number.isFinite(sinceMs)) rows = rows.filter((r) => Date.parse(r.at) >= sinceMs);
  }
  if (opts.userId) {
    rows = rows.filter((r) => r.user?.id === opts.userId);
  }
  return rows.slice(0, limit).map(normalizeEntry);
}

function installProcessHandlers() {
  if (installProcessHandlers._installed) return;
  installProcessHandlers._installed = true;
  process.on('uncaughtException', (err) => {
    error('process', 'uncaughtException', {
      name: err?.name,
      message: err?.message || String(err),
      stack: err?.stack,
    });
  });
  process.on('unhandledRejection', (reason) => {
    error('process', 'unhandledRejection', {
      message: reason?.message || String(reason),
      stack: reason?.stack,
    });
  });
}

module.exports = {
  LEVELS,
  setConfig,
  status,
  close,
  append,
  error,
  warn,
  info,
  maintenance,
  query,
  installProcessHandlers,
};

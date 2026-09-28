'use strict';

const { CONFIG_JSON_FILES, isConfigJsonFile } = require('./keys');
const mongoBackend = require('./mongoBackend');
const { migrateConfigFilesToMongo } = require('./migrateFromFiles');
const { CONFIG_URI, DEPLOYMENT_MODE } = require('../config');

function resolveConfigTenantId() {
  return require('../project/projectTenantContext').resolveConfigTenantId();
}

function defaultParcSettings() {
  return require('../parc/deviceRegistry').defaultParcSettings();
}

const cache = new Map();
const loadedTenants = new Set();
let ready = false;
let initPromise = null;
const pendingWrites = new Map();
let flushTimer = null;
const FLUSH_MS = 50;

function cacheKey(tenantId, key) {
  return `${tenantId}:${key}`;
}

function defaultWorkspaceDocuments() {
  return {
    'settings.json': {
      scanMs: 100,
      graphMaxPoints: 600,
      graphPens: [],
      startup: { mode: 'blank' },
      project: {},
    },
    'tags.json': [],
    'drivers.json': [],
    'parc.json': { devices: {}, settings: defaultParcSettings() },
  };
}

function initMemorySync() {
  if (CONFIG_URI !== 'memory' || ready) return false;
  ready = true;
  return true;
}

function readSync(key, fallback) {
  const tid = resolveConfigTenantId();
  const ck = cacheKey(tid, key);
  if (!ready || !cache.has(ck)) return fallback;
  return cache.get(ck);
}

function writeSync(key, data) {
  if (!ready) {
    throw new Error('configStore not ready');
  }
  const tid = resolveConfigTenantId();
  const ck = cacheKey(tid, key);
  cache.set(ck, data);
  pendingWrites.set(ck, { tenantId: tid, key, data });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPending().catch((e) => {
      console.warn('[configStore] flush:', e.message || e);
    });
  }, FLUSH_MS);
}

async function flushPending() {
  if (!pendingWrites.size) return;
  const batch = new Map(pendingWrites);
  pendingWrites.clear();
  for (const [, row] of batch) {
    await mongoBackend.writeDocument(row.key, row.data, row.tenantId);
  }
}

async function ensureTenantLoaded(tenantId, opts = {}) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required');
  if (loadedTenants.has(tid)) return { tenantId: tid, seeded: false };

  const keys = [...CONFIG_JSON_FILES];
  let docs = await mongoBackend.loadAllDocuments(keys, tid);
  let seeded = false;

  if (docs.size === 0 && opts.seedIfEmpty !== false) {
    const defaults = defaultWorkspaceDocuments();
    for (const [key, data] of Object.entries(defaults)) {
      await mongoBackend.writeDocument(key, data, tid);
      docs.set(key, data);
    }
    seeded = true;
  }

  for (const [key, data] of docs) {
    cache.set(cacheKey(tid, key), data);
  }
  loadedTenants.add(tid);
  return { tenantId: tid, seeded, documentCount: docs.size };
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (mongoBackend.isMemoryMode()) {
      mongoBackend.resetMemory();
    }

    if (DEPLOYMENT_MODE === 'cloud') {
      await mongoBackend.connect();
      ready = true;
      console.log('[configStore] mongo ready (cloud multi-tenant; lazy load per org)');
      return { backend: 'mongo', status: mongoBackend.status() };
    }

    const keys = [...CONFIG_JSON_FILES];
    let docs = await mongoBackend.loadAllDocuments(keys);

    if (docs.size === 0 && !mongoBackend.isMemoryMode()) {
      const imported = await migrateConfigFilesToMongo({
        writeDocument: (key, data) => mongoBackend.writeDocument(key, data),
      }, { seedProjects: false });
      if (imported.length) {
        docs = await mongoBackend.loadAllDocuments(keys);
        console.log(`[configStore] seeded ${imported.length} document(s) from data/`);
      }
    }

    const tid = resolveConfigTenantId();
    for (const [key, data] of docs) {
      cache.set(cacheKey(tid, key), data);
    }
    loadedTenants.add(tid);
    ready = true;
    const status = mongoBackend.status();
    console.log(`[configStore] mongo ready (${docs.size} documents; projects on disk)`);
    return { backend: 'mongo', status };
  })();
  try {
    return await initPromise;
  } catch (e) {
    initPromise = null;
    throw e;
  }
}

async function shutdown() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushPending();
  await mongoBackend.close();
  ready = false;
  initPromise = null;
  cache.clear();
  loadedTenants.clear();
}

function status() {
  return {
    backend: 'mongo',
    ready,
    cachedKeys: [...cache.keys()],
    loadedTenants: [...loadedTenants],
    projectsBackend: 'disk',
    mongo: mongoBackend.status(),
  };
}

/** @deprecated Projects live on disk — delegates to projectStore. */
function listProjectsSync() {
  return require('../project/projectStore').listProjects();
}

/** @deprecated Projects live on disk — delegates to projectStore. */
async function refreshProjectIndex() {
  return require('../project/projectStore').listProjectsFresh();
}

/** @deprecated Projects live on disk — delegates to projectStore. */
async function saveProjectDoc(projectId, doc, deps) {
  return require('../project/projectStore').saveProjectDoc(projectId || doc?.project?.name || 'project', doc, deps);
}

/** @deprecated Projects live on disk — delegates to projectStore. */
async function loadProjectDoc(projectId) {
  return require('../project/projectStore').loadProjectDoc(projectId);
}

/** @deprecated Projects live on disk — delegates to projectStore. */
async function deleteProjectDoc(projectId) {
  return require('../project/projectStore').deleteProjectDoc(projectId);
}

if (CONFIG_URI === 'memory') {
  initMemorySync();
}

module.exports = {
  isConfigJsonFile,
  readSync,
  writeSync,
  init,
  initMemorySync,
  shutdown,
  status,
  flushPending,
  ensureTenantLoaded,
  refreshProjectIndex,
  listProjectsSync,
  saveProjectDoc,
  loadProjectDoc,
  deleteProjectDoc,
};

'use strict';

const { CONFIG_JSON_FILES, isConfigJsonFile } = require('./keys');
const mongoBackend = require('./mongoBackend');
const { migrateConfigFilesToMongo, syncBundledProjectsFromDisk } = require('./migrateFromFiles');
const { safeId: projectSafeId } = require('../project/projectIds');
const { CONFIG_URI } = require('../config');

const cache = new Map();
let ready = false;
let initPromise = null;
const pendingWrites = new Map();
let flushTimer = null;
const FLUSH_MS = 50;
/** @type {Array<{ id: string, name: string, savedAt: string|null, tagCount: number|null, driverCount: number|null }>} */
let projectIndex = [];

function initMemorySync() {
  if (CONFIG_URI !== 'memory' || ready) return false;
  ready = true;
  return true;
}

function readSync(key, fallback) {
  if (!ready || !cache.has(key)) return fallback;
  return cache.get(key);
}

function writeSync(key, data) {
  if (!ready) {
    throw new Error('configStore not ready');
  }
  cache.set(key, data);
  pendingWrites.set(key, data);
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
  for (const [key, data] of batch) {
    await mongoBackend.writeDocument(key, data);
  }
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (mongoBackend.isMemoryMode()) {
      mongoBackend.resetMemory();
    }
    const keys = [...CONFIG_JSON_FILES];
    let docs = await mongoBackend.loadAllDocuments(keys);

    if (docs.size === 0 && !mongoBackend.isMemoryMode()) {
      const imported = await migrateConfigFilesToMongo({
        writeDocument: mongoBackend.writeDocument,
        writeProjectSnapshot: mongoBackend.writeProjectSnapshot,
        safeId: projectSafeId,
      });
      if (imported.length) {
        docs = await mongoBackend.loadAllDocuments(keys);
        console.log(`[configStore] seeded ${imported.length} document(s) from data/`);
      }
    }

    for (const [key, data] of docs) {
      cache.set(key, data);
    }
    projectIndex = await mongoBackend.listProjectSnapshots();
    const synced = await syncBundledProjectsFromDisk({
      writeProjectSnapshot: mongoBackend.writeProjectSnapshot,
      safeId: projectSafeId,
      existingIds: new Set(projectIndex.map((p) => p.id)),
    });
    if (synced.length) {
      projectIndex = await mongoBackend.listProjectSnapshots();
      console.log(`[configStore] synced bundled project(s): ${synced.join(', ')}`);
    }
    ready = true;
    const status = mongoBackend.status();
    console.log(`[configStore] mongo ready (${docs.size} documents)`);
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
  projectIndex = [];
}

function status() {
  return {
    backend: 'mongo',
    ready,
    cachedKeys: [...cache.keys()],
    mongo: mongoBackend.status(),
  };
}

function listProjectsSync() {
  return projectIndex.slice();
}

async function refreshProjectIndex() {
  if (!ready && !mongoBackend.isMemoryMode()) return [];
  projectIndex = await mongoBackend.listProjectSnapshots();
  return projectIndex.slice();
}

async function saveProjectDoc(projectId, doc) {
  const id = projectSafeId(projectId || doc?.project?.name || 'project');
  const saved = await mongoBackend.writeProjectSnapshot(id, doc, { name: doc?.project?.name || id });
  await refreshProjectIndex();
  return { id, savedAt: saved.savedAt };
}

async function loadProjectDoc(projectId) {
  const id = projectSafeId(projectId);
  const row = await mongoBackend.readProjectSnapshot(id);
  if (!row?.data) {
    throw Object.assign(new Error(`Project not found: ${id}`), { status: 404 });
  }
  return row.data;
}

async function deleteProjectDoc(projectId) {
  const id = projectSafeId(projectId);
  const ok = await mongoBackend.deleteProjectSnapshot(id);
  await refreshProjectIndex();
  return ok;
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
  refreshProjectIndex,
  listProjectsSync,
  saveProjectDoc,
  loadProjectDoc,
  deleteProjectDoc,
};

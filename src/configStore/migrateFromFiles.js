'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { CONFIG_JSON_FILES } = require('./keys');
function readFileJson(name, fallback) {
  const fp = path.join(DATA_DIR, name);
  if (!fs.existsSync(fp)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return fallback;
  }
}

function listFileProjects() {
  const dir = path.join(DATA_DIR, 'projects');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.est\.json$/i.test(f));
}

/**
 * Import JSON config files from data/ into mongo cache (and optionally persist).
 * @param {{ writeDocument: Function, writeProjectSnapshot: Function, safeId: Function }} backend
 * @param {{ seedProjects?: boolean }} opts
 */
async function migrateConfigFilesToMongo(backend, opts = {}) {
  const imported = [];
  for (const key of CONFIG_JSON_FILES) {
    const data = readFileJson(key, null);
    if (data == null) continue;
    await backend.writeDocument(key, data);
    imported.push(key);
  }
  if (opts.seedProjects !== false) {
    const synced = await syncBundledProjectsFromDisk(backend);
    imported.push(...synced.map((id) => `projects/${id}`));
  }
  return imported;
}

/**
 * Import data/projects/*.est.json snapshots that are not yet in Mongo.
 * Safe to run on every startup — skips projects already in the library.
 * @param {{ writeProjectSnapshot: Function, safeId: Function, existingIds?: Set<string> }} backend
 */
async function syncBundledProjectsFromDisk(backend, opts = {}) {
  const imported = [];
  const existing = opts.existingIds || new Set();
  const { safeId } = backend;
  const FORCE_REFRESH_IDS = new Set(['assisted-living', 'mle-wastewater']);

  for (const fname of listFileProjects()) {
    const id = fname.replace(/\.est\.json$/i, '');
    const projectId = typeof safeId === 'function' ? safeId(id) : id;
    if (existing.has(projectId) && !FORCE_REFRESH_IDS.has(projectId) && !opts.forceAll) continue;
    const doc = readFileJson(path.join('projects', fname), null);
    if (!doc) continue;
    await backend.writeProjectSnapshot(projectId, doc, { name: doc?.project?.name || id });
    imported.push(projectId);
  }
  return imported;
}

module.exports = { migrateConfigFilesToMongo, syncBundledProjectsFromDisk, readFileJson, listFileProjects };

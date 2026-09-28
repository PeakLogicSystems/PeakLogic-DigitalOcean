'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { exportFilename } = require('./estFile');

const HUB_DIR = path.join(DATA_DIR, 'project-hub');

function ensureHubDir() {
  if (!fs.existsSync(HUB_DIR)) fs.mkdirSync(HUB_DIR, { recursive: true });
  return HUB_DIR;
}

function catalogPath() {
  return path.join(ensureHubDir(), 'catalog.json');
}

function readCatalog() {
  ensureHubDir();
  try {
    const raw = fs.readFileSync(catalogPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCatalog(entries) {
  ensureHubDir();
  fs.writeFileSync(catalogPath(), JSON.stringify(entries, null, 2));
}

function safeSlug(name) {
  const base = String(name || 'project').trim().replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'project';
  return base.toLowerCase();
}

function estPathForSlug(slug) {
  return path.join(ensureHubDir(), `${slug}.est.json`);
}

function listEntries() {
  const catalog = readCatalog();
  return catalog
    .filter((e) => e && e.id && e.slug)
    .map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name || e.slug,
      description: e.description || '',
      updatedAt: e.updatedAt || null,
      source: 'local',
    }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function loadEstDoc(idOrSlug) {
  const key = String(idOrSlug || '').trim();
  if (!key) throw Object.assign(new Error('Missing project id'), { status: 400 });
  const catalog = readCatalog();
  const entry = catalog.find((e) => e.id === key || e.slug === key);
  if (!entry) throw Object.assign(new Error(`Project not in repository: ${key}`), { status: 404 });
  const filePath = estPathForSlug(entry.slug);
  if (!fs.existsSync(filePath)) {
    throw Object.assign(new Error(`Repository file missing for ${entry.name}`), { status: 404 });
  }
  return { entry, doc: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
}

function publishDoc(name, doc, meta = {}) {
  const projectName = String(name || doc?.project?.name || 'project').trim() || 'project';
  const slug = safeSlug(meta.slug || projectName);
  const catalog = readCatalog();
  const now = new Date().toISOString();
  let entry = catalog.find((e) => e.slug === slug);
  if (!entry) {
    entry = {
      id: slug,
      slug,
      name: projectName,
      description: String(meta.description || '').trim(),
      createdAt: now,
      updatedAt: now,
    };
    catalog.push(entry);
  } else {
    entry.name = projectName;
    entry.description = String(meta.description || entry.description || '').trim();
    entry.updatedAt = now;
  }
  const normalized = { ...doc, project: { ...(doc.project || {}), name: projectName } };
  fs.writeFileSync(estPathForSlug(slug), JSON.stringify(normalized, null, 2));
  writeCatalog(catalog);
  return {
    ...entry,
    filename: exportFilename(projectName),
    source: 'local',
  };
}

function removeEntry(idOrSlug) {
  const key = String(idOrSlug || '').trim();
  const catalog = readCatalog();
  const idx = catalog.findIndex((e) => e.id === key || e.slug === key);
  if (idx < 0) throw Object.assign(new Error(`Project not in repository: ${key}`), { status: 404 });
  const [entry] = catalog.splice(idx, 1);
  const filePath = estPathForSlug(entry.slug);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  writeCatalog(catalog);
  return { ok: true };
}

module.exports = {
  HUB_DIR,
  listEntries,
  loadEstDoc,
  publishDoc,
  removeEntry,
  safeSlug,
};

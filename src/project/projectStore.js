'use strict';

const fs = require('fs');
const path = require('path');
const persistence = require('../persistence');

function projectsDir() {
  const dir = persistence.filePath('projects');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeId(name) {
  const s = String(name || '').trim().toLowerCase();
  const id = s
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return id || 'project';
}

function projectPath(id) {
  return path.join(projectsDir(), `${safeId(id)}.est.json`);
}

function listProjects() {
  const dir = projectsDir();
  const files = fs.readdirSync(dir).filter((f) => /\.est\.json$/i.test(f));
  return files.map((f) => {
    const fp = path.join(dir, f);
    const id = f.replace(/\.est\.json$/i, '');
    let meta = {};
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      meta = {
        name: raw?.project?.name || id,
        savedAt: raw?.savedAt || null,
        tagCount: Array.isArray(raw?.tags) ? raw.tags.length : null,
        driverCount: Array.isArray(raw?.drivers) ? raw.drivers.length : null,
      };
    } catch {
      meta = { name: id, savedAt: null, tagCount: null, driverCount: null };
    }
    return { id, ...meta };
  }).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

function saveProjectDoc(nameOrId, doc) {
  const id = safeId(nameOrId || doc?.project?.name || 'project');
  const fp = projectPath(id);
  const out = { ...doc, savedAt: new Date().toISOString() };
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
  return { id, path: fp };
}

function loadProjectDoc(id) {
  const fp = projectPath(id);
  if (!fs.existsSync(fp)) throw Object.assign(new Error(`Project not found: ${safeId(id)}`), { status: 404 });
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function deleteProjectDoc(id) {
  const fp = projectPath(id);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

module.exports = {
  safeId,
  listProjects,
  saveProjectDoc,
  loadProjectDoc,
  deleteProjectDoc,
};


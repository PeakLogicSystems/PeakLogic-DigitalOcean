'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { blankFacilityDoc, normalizeFacility, validateFacility } = require('./facilityFormat');

const FACILITY_DIR = path.join(DATA_DIR, 'facility-builder');
const ACTIVE_PATH = path.join(FACILITY_DIR, 'active.json');
const UPLOADS_DIR = path.join(FACILITY_DIR, 'uploads');
const PROJECTS_DIR = path.join(FACILITY_DIR, 'projects');

function ensureDirs() {
  fs.mkdirSync(FACILITY_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function readActiveProject() {
  ensureDirs();
  try {
    const raw = JSON.parse(fs.readFileSync(ACTIVE_PATH, 'utf8'));
    return normalizeFacility(raw);
  } catch {
    return blankFacilityDoc();
  }
}

function writeActiveProject(doc) {
  ensureDirs();
  const normalized = normalizeFacility(doc);
  const err = validateFacility(normalized);
  if (err) throw Object.assign(new Error(err), { status: 400 });
  normalized.savedAt = new Date().toISOString();
  fs.writeFileSync(ACTIVE_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

function newActiveProject(meta = {}) {
  return writeActiveProject(blankFacilityDoc(meta));
}

function saveNamedProject(name, doc) {
  ensureDirs();
  const safe = String(name || 'untitled').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'untitled';
  const normalized = normalizeFacility(doc, { name: safe });
  normalized.savedAt = new Date().toISOString();
  fs.writeFileSync(path.join(PROJECTS_DIR, `${safe}.mvdraw.json`), JSON.stringify(normalized, null, 2));
  return normalized;
}

function listNamedProjects() {
  ensureDirs();
  return fs.readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith('.mvdraw.json'))
    .map((f) => {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8'));
        return { file: f, name: doc.name || f.replace(/\.mvdraw\.json$/, ''), savedAt: doc.savedAt || null };
      } catch {
        return { file: f, name: f, savedAt: null };
      }
    });
}

function uploadsDir() {
  ensureDirs();
  return UPLOADS_DIR;
}

function relativeUploadPath(filename) {
  return `uploads/${path.basename(filename)}`;
}

function resolveUpload(relPath) {
  const base = path.basename(String(relPath || '').replace(/^uploads[/\\]/, ''));
  if (!base) return null;
  const full = path.join(UPLOADS_DIR, base);
  if (!full.startsWith(UPLOADS_DIR)) return null;
  return fs.existsSync(full) ? full : null;
}

module.exports = {
  FACILITY_DIR,
  UPLOADS_DIR,
  readActiveProject,
  writeActiveProject,
  newActiveProject,
  saveNamedProject,
  listNamedProjects,
  uploadsDir,
  relativeUploadPath,
  resolveUpload,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../../src/config');
const { blankFacilityDrawDoc, normalizeFacilityDraw, validateFacilityDraw } = require('./facilityDrawFormat');

const FACILITY_DRAW_DIR = path.join(DATA_DIR, 'facility-draw');
const ACTIVE_PATH = path.join(FACILITY_DRAW_DIR, 'active.json');
const UPLOADS_DIR = path.join(FACILITY_DRAW_DIR, 'uploads');
const PROJECTS_DIR = path.join(FACILITY_DRAW_DIR, 'projects');

const PROJECTS_REL = 'data/facility-draw/projects';
const ACTIVE_REL = 'data/facility-draw/active.json';

function libraryRelPath(file) {
  if (!file) return null;
  return `${PROJECTS_REL}/${file}`;
}

function projectStorageInfo(project) {
  const libraryFile = project?.libraryFile || null;
  return {
    activePath: ACTIVE_REL,
    projectsDir: PROJECTS_REL,
    libraryFile,
    libraryPath: libraryRelPath(libraryFile),
  };
}
function ensureDirs() {
  fs.mkdirSync(FACILITY_DRAW_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function readActiveProject() {
  ensureDirs();
  try {
    const raw = JSON.parse(fs.readFileSync(ACTIVE_PATH, 'utf8'));
    return normalizeFacilityDraw(raw);
  } catch {
    return blankFacilityDrawDoc();
  }
}

function writeActiveProject(doc) {
  ensureDirs();
  const normalized = normalizeFacilityDraw(doc);
  const err = validateFacilityDraw(normalized);
  if (err) throw Object.assign(new Error(err), { status: 400 });
  normalized.savedAt = new Date().toISOString();
  fs.writeFileSync(ACTIVE_PATH, JSON.stringify(normalized, null, 2));
  if (normalized.libraryFile) {
    const { full } = resolveProjectFile(normalized.libraryFile);
    fs.writeFileSync(full, JSON.stringify(normalized, null, 2));
  }
  return normalized;
}

function newActiveProject(meta = {}) {
  const doc = blankFacilityDrawDoc(meta);
  doc.libraryFile = null;
  return writeActiveProject(doc);
}

function isDefaultProjectName(name) {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === 'untitled';
}

function saveNamedProject(fileBase, doc, opts = {}) {
  ensureDirs();
  const safe = String(fileBase || 'untitled').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'untitled';
  const normalized = normalizeFacilityDraw(doc);
  if (opts.alignProjectName || isDefaultProjectName(normalized.name)) {
    normalized.name = safe;
  }
  normalized.savedAt = new Date().toISOString();
  const file = `${safe}.facilitydraw.json`;
  normalized.libraryFile = file;
  fs.writeFileSync(path.join(PROJECTS_DIR, file), JSON.stringify(normalized, null, 2));
  return { project: normalized, file };
}

function resolveProjectFile(file) {
  const base = path.basename(String(file || ''));
  if (!base || !base.endsWith('.facilitydraw.json')) {
    throw Object.assign(new Error('Invalid project file'), { status: 400 });
  }
  const full = path.join(PROJECTS_DIR, base);
  if (!full.startsWith(PROJECTS_DIR)) {
    throw Object.assign(new Error('Invalid project file'), { status: 400 });
  }
  return { base, full };
}

function readNamedProject(file) {
  ensureDirs();
  const { full } = resolveProjectFile(file);
  if (!fs.existsSync(full)) {
    throw Object.assign(new Error('Project not found'), { status: 404 });
  }
  const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  return normalizeFacilityDraw(raw);
}

function openNamedProject(file) {
  const { base } = resolveProjectFile(file);
  const doc = readNamedProject(file);
  doc.libraryFile = base;
  return writeActiveProject(doc);
}

function listNamedProjects() {
  ensureDirs();
  return fs.readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith('.facilitydraw.json'))
    .map((f) => {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8'));
        return {
          file: f,
          path: libraryRelPath(f),
          name: doc.name || f.replace(/\.facilitydraw\.json$/, ''),
          savedAt: doc.savedAt || null,
        };
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
  FACILITY_DRAW_DIR,
  UPLOADS_DIR,
  readActiveProject,
  writeActiveProject,
  newActiveProject,
  saveNamedProject,
  listNamedProjects,
  readNamedProject,
  openNamedProject,
  resolveProjectFile,
  projectStorageInfo,
  ACTIVE_REL,
  PROJECTS_REL,
  uploadsDir,
  relativeUploadPath,
  resolveUpload,
};

'use strict';

const fs = require('fs');
const path = require('path');
const persistence = require('../persistence');
const { safeId } = require('./projectIds');
const { getProjectTenantId } = require('./projectTenantContext');
const { globalProjectsDir, tenantProjectsDir } = require('../tenants/tenantPaths');

// Lazy requires avoid circular load: projectArchive → estFile → parc → persistence → configStore
function projectArchive() {
  return require('./projectArchive');
}
function estFormat() {
  return require('./estFile').EST_FORMAT;
}
const ZIP_EXT = '.est.zip';

/** @type {Map<string, { mtimeMs: number, size: number, meta: object }>} */
const fileMetaCache = new Map();

function projectsDir() {
  const tid = getProjectTenantId();
  const dir = tid ? tenantProjectsDir(tid) : globalProjectsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function projectsStorageLabel() {
  return projectsDir();
}

function projectPath(id) {
  return path.join(projectsDir(), `${safeId(id)}${ZIP_EXT}`);
}

function projectJsonPath(id) {
  return path.join(projectsDir(), `${safeId(id)}.est.json`);
}

function invalidateProjectListCache(filePath) {
  if (filePath) fileMetaCache.delete(filePath);
  else fileMetaCache.clear();
}

function readProjectMeta(fp, id) {
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    return { name: id, savedAt: null, tagCount: null, driverCount: null };
  }
  const cached = fileMetaCache.get(fp);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return cached.meta;
  }
  let meta;
  try {
    const unpacked = projectArchive().unpackArchive(fs.readFileSync(fp));
    const raw = unpacked.project;
    meta = {
      name: raw?.project?.name || unpacked.manifest?.projectName || id,
      savedAt: raw?.savedAt || unpacked.manifest?.exportedAt || null,
      tagCount: Array.isArray(raw?.tags) ? raw.tags.length : null,
      driverCount: Array.isArray(raw?.drivers) ? raw.drivers.length : null,
    };
  } catch {
    meta = { name: id, savedAt: null, tagCount: null, driverCount: null };
  }
  fileMetaCache.set(fp, { mtimeMs: st.mtimeMs, size: st.size, meta });
  return meta;
}

function readJsonProjectMeta(fp, label) {
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    return { name: label, savedAt: null, tagCount: null, driverCount: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return {
      name: raw?.project?.name || label.replace(/\.(est\.json|mvbundle|json)$/i, ''),
      savedAt: raw?.savedAt || st.mtime.toISOString(),
      tagCount: Array.isArray(raw?.tags) ? raw.tags.length : null,
      driverCount: Array.isArray(raw?.drivers) ? raw.drivers.length : null,
    };
  } catch {
    return { name: label, savedAt: st.mtime.toISOString(), tagCount: null, driverCount: null };
  }
}

function isImportableProjectFilename(name) {
  const lower = String(name || '').toLowerCase();
  return lower.endsWith('.est.zip')
    || lower.endsWith('.est.json')
    || lower.endsWith('.mvbundle');
}

function resolveImportableProjectPath(filename) {
  const base = path.basename(String(filename || '').trim());
  if (!base || base !== filename) {
    throw Object.assign(new Error('Invalid project filename'), { status: 400 });
  }
  if (!isImportableProjectFilename(base)) {
    throw Object.assign(new Error('Expected .est.zip, .est.json, or .mvbundle'), { status: 400 });
  }
  const fp = path.join(projectsDir(), base);
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    throw Object.assign(new Error(`Project file not found: ${base}`), { status: 404 });
  }
  const resolved = fs.realpathSync.native(fp);
  const root = fs.realpathSync.native(projectsDir());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw Object.assign(new Error('Invalid project path'), { status: 400 });
  }
  return resolved;
}

function listImportableProjects() {
  const dir = projectsDir();
  const files = fs.readdirSync(dir).filter((f) => isImportableProjectFilename(f));
  return files.map((f) => {
    const fp = path.join(dir, f);
    const lower = f.toLowerCase();
    const meta = lower.endsWith('.est.zip')
      ? readProjectMeta(fp, f.slice(0, -ZIP_EXT.length))
      : readJsonProjectMeta(fp, f);
    return {
      file: f,
      format: lower.endsWith('.est.zip') ? 'zip' : 'json',
      ...meta,
    };
  }).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

function readImportableProjectBuffer(filename) {
  const fp = resolveImportableProjectPath(filename);
  return { buffer: fs.readFileSync(fp), filename: path.basename(fp) };
}

function listProjects() {
  const dir = projectsDir();
  const names = fs.readdirSync(dir);
  const zipIds = new Set();
  const projects = [];

  for (const f of names) {
    if (!f.toLowerCase().endsWith(ZIP_EXT)) continue;
    const fp = path.join(dir, f);
    const id = f.slice(0, -ZIP_EXT.length);
    zipIds.add(id);
    projects.push({ id, format: 'zip', ...readProjectMeta(fp, id) });
  }

  // Legacy library entries: .est.json with no matching .est.zip
  for (const f of names) {
    if (!/\.est\.json$/i.test(f)) continue;
    const id = f.replace(/\.est\.json$/i, '');
    if (zipIds.has(id) || zipIds.has(safeId(id))) continue;
    const fp = path.join(dir, f);
    projects.push({ id: safeId(id), format: 'json', ...readJsonProjectMeta(fp, id) });
  }

  const livePaths = new Set(projects.map((p) => (
    p.format === 'zip' ? projectPath(p.id) : projectJsonPath(p.id)
  )));
  for (const fp of fileMetaCache.keys()) {
    if (!livePaths.has(fp)) fileMetaCache.delete(fp);
  }

  return projects.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

async function listProjectsFresh() {
  return listProjects();
}

function saveProjectArchive(nameOrId, archiveBuffer) {
  const id = safeId(nameOrId);
  const fp = projectPath(id);
  const buf = Buffer.isBuffer(archiveBuffer) ? archiveBuffer : Buffer.from(archiveBuffer);
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, fp);
  invalidateProjectListCache(fp);
  return { id, path: fp, savedAt: new Date().toISOString() };
}

function saveProjectDoc(nameOrId, doc, deps) {
  const name = doc?.project?.name || nameOrId || 'project';
  const id = safeId(nameOrId || name);
  const arch = projectArchive();
  let archiveBuffer;
  if (deps) {
    const PACKAGE_VERSION = require('../../package.json').version;
    archiveBuffer = arch.packArchive(deps, { name, exportedBy: PACKAGE_VERSION });
  } else {
    const programs = arch.collectProgramSources();
    const parc = persistence.readJson('parc.json', null);
    archiveBuffer = arch.packArchiveFromParts({
      project: doc,
      programs,
      activeProgram: doc?.activeProgram || '',
      parc,
      facilityDraw: doc?.facilityDraw || null,
      meta: { name },
    });
  }
  return saveProjectArchive(id, archiveBuffer);
}

function loadProjectArchive(id) {
  const fp = projectPath(id);
  if (!fs.existsSync(fp)) {
    throw Object.assign(new Error(`Project not found: ${safeId(id)}`), { status: 404 });
  }
  return projectArchive().unpackArchive(fs.readFileSync(fp));
}

function loadProjectDoc(id) {
  const zipFp = projectPath(id);
  const jsonFp = projectJsonPath(id);
  const format = estFormat();
  if (fs.existsSync(zipFp)) {
    try {
      const unpacked = loadProjectArchive(id);
      if (!unpacked.project || unpacked.project.format !== format) {
        throw Object.assign(new Error('Invalid project archive'), { status: 400 });
      }
      return unpacked.project;
    } catch (e) {
      if (!fs.existsSync(jsonFp)) throw e;
      console.warn(`[project] zip load failed for ${safeId(id)}, falling back to .est.json:`, e.message || e);
    }
  }
  if (fs.existsSync(jsonFp)) {
    try {
      const raw = JSON.parse(fs.readFileSync(jsonFp, 'utf8'));
      if (raw?.format && raw.format !== format) {
        throw Object.assign(new Error('Invalid project file'), { status: 400 });
      }
      return raw;
    } catch (e) {
      if (e.status) throw e;
      throw Object.assign(new Error(`Invalid project JSON: ${safeId(id)}`), { status: 400 });
    }
  }
  throw Object.assign(new Error(`Project not found: ${safeId(id)}`), { status: 404 });
}

function readProjectArchiveBuffer(id) {
  const fp = projectPath(id);
  if (fs.existsSync(fp)) return fs.readFileSync(fp);
  const arch = projectArchive();
  const doc = loadProjectDoc(id);
  return arch.packArchiveFromParts({
    project: doc,
    programs: typeof doc.program === 'string' && doc.activeProgram
      ? { [doc.activeProgram]: doc.program }
      : {},
    activeProgram: doc.activeProgram || '',
    facilityDraw: doc.facilityDraw || null,
    meta: { name: doc?.project?.name || id },
  });
}

function deleteProjectDoc(id) {
  const sid = safeId(id);
  const zipFp = projectPath(sid);
  const jsonFp = projectJsonPath(sid);
  let removed = false;
  if (fs.existsSync(zipFp)) {
    fs.unlinkSync(zipFp);
    invalidateProjectListCache(zipFp);
    removed = true;
  }
  if (fs.existsSync(jsonFp)) {
    fs.unlinkSync(jsonFp);
    invalidateProjectListCache(jsonFp);
    removed = true;
  }
  return removed;
}

module.exports = {
  ZIP_EXT,
  projectsDir,
  safeId,
  listProjects,
  listProjectsFresh,
  projectsStorageLabel,
  listImportableProjects,
  readImportableProjectBuffer,
  resolveImportableProjectPath,
  isImportableProjectFilename,
  saveProjectArchive,
  saveProjectDoc,
  loadProjectArchive,
  loadProjectDoc,
  deleteProjectDoc,
  readProjectArchiveBuffer,
  invalidateProjectListCache,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { ST_DIR: GLOBAL_ST_DIR, DEFAULT_PROGRAM, DATA_DIR } = require('../config');
const { resolveStDir } = require('../tenants/tenantPaths');
const persistence = require('../persistence');

function stDir() {
  return resolveStDir();
}

function ensureStDir() {
  const dir = stDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeRel(rel) {
  const raw = String(rel ?? '').trim();
  if (!raw || raw === '.' || raw === './') return '';
  const norm = path.normalize(raw).replace(/^(\.\.(\/|\\|$))+/, '');
  const cleaned = norm.replace(/\\/g, '/');
  if (!cleaned || cleaned === '.' || cleaned === './') return '';
  return cleaned;
}

function isValidProgramRel(rel) {
  const safe = sanitizeRel(rel);
  return !!safe && /\.st$/i.test(safe);
}

function resolvePath(rel) {
  const dir = ensureStDir();
  return path.join(dir, sanitizeRel(rel));
}

function activeRelFromWorkspace() {
  const ws = persistence.readJson('workspace.est.json', null);
  const fromWs = (typeof ws?.activeProgram === 'string' && ws.activeProgram)
    ? ws.activeProgram
    : ws?.settings?.activeProgram;
  if (typeof fromWs === 'string' && fromWs) return sanitizeRel(fromWs);
  return '';
}

function activeRel() {
  const s = persistence.readJson('settings.json', {});
  if (s.activeProgram === null || s.activeProgram === '') return '';
  if (s.activeProgram) return sanitizeRel(s.activeProgram);
  return sanitizeRel(DEFAULT_PROGRAM);
}

/** Resolve and persist activeProgram from settings or workspace before boot deploy. */
function ensureActiveProgram() {
  let rel = activeRel();
  if (rel && programExists(rel)) {
    const s = persistence.readJson('settings.json', {});
    if (s.activeProgram !== rel) setActive(rel);
    return rel;
  }
  const s = persistence.readJson('settings.json', {});
  if (typeof s.activeProgram === 'string' && s.activeProgram) {
    rel = setActive(s.activeProgram);
    if (programExists(rel)) return rel;
  }
  const fromWs = activeRelFromWorkspace();
  if (fromWs) {
    rel = setActive(fromWs);
    return rel;
  }
  return rel || '';
}

function setActive(rel) {
  const s = persistence.readJson('settings.json', {});
  s.activeProgram = sanitizeRel(rel);
  persistence.writeJson('settings.json', s);
  return s.activeProgram;
}

function clearActive() {
  const s = persistence.readJson('settings.json', {});
  s.activeProgram = null;
  persistence.writeJson('settings.json', s);
  return '';
}

function readActive() {
  const rel = activeRel();
  if (!rel) return '';
  return readProgram(rel);
}

function writeActive(source) {
  const rel = activeRel();
  if (!rel) return;
  writeProgram(rel, source);
}

function programExists(rel) {
  return fs.existsSync(resolvePath(rel));
}

function readProgram(rel) {
  const safe = sanitizeRel(rel);
  if (!safe) return '';
  const fp = resolvePath(safe);
  if (!fs.existsSync(fp)) return '';
  const st = fs.statSync(fp);
  if (!st.isFile()) return '';
  return fs.readFileSync(fp, 'utf8');
}

/** Lightweight change token for dashboard polls — avoids re-sending/parsing huge ST every tick. */
function activeProgramMeta() {
  const rel = activeRel();
  if (!rel) return { path: '', mtimeMs: 0, size: 0 };
  const fp = resolvePath(rel);
  if (!fs.existsSync(fp)) return { path: rel, mtimeMs: 0, size: 0 };
  const st = fs.statSync(fp);
  if (!st.isFile()) return { path: rel, mtimeMs: 0, size: 0 };
  return { path: rel, mtimeMs: st.mtimeMs, size: st.size };
}

function writeProgram(rel, source) {
  if (!isValidProgramRel(rel)) return;
  const safe = sanitizeRel(rel);
  const fp = resolvePath(safe);
  if (fs.existsSync(fp)) {
    const st = fs.statSync(fp);
    if (!st.isFile()) return;
  }
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, source, 'utf8');
}

/** Map a picked filename to a path under st/ (e.g. logic/my_prog.st). */
function suggestRelFromFilename(filename) {
  const raw = String(filename || 'program.st').replace(/\\/g, '/');
  const base = path.basename(raw);
  const stem = base.replace(/\.st$/i, '') || 'program';
  const name = base.toLowerCase().endsWith('.st') ? base : `${stem}.st`;
  if (raw.includes('/')) {
    const dir = path.dirname(raw).replace(/\\/g, '/');
    return sanitizeRel(`${dir}/${name}`);
  }
  return sanitizeRel(`logic/${name}`);
}

function saveToPath(rel, source, makeActive = true) {
  const safe = sanitizeRel(rel);
  if (!/\.st$/i.test(safe)) {
    throw new Error('Program path must end with .st');
  }
  writeProgram(safe, source);
  if (makeActive) setActive(safe);
  return safe;
}

function listProgramsInRoot(rootDir) {
  const out = [];
  function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, rel);
      else if (name.endsWith('.st')) {
        const parts = rel.split('/');
        out.push({
          path: rel.replace(/\\/g, '/'),
          name: name.replace(/\.st$/, ''),
          category: parts.length > 1 ? parts[0] : 'root',
        });
      }
    }
  }
  walk(rootDir, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function listPrograms() {
  const root = ensureStDir();
  return listProgramsInRoot(root);
}

/** Shipped sample paths under st/ — kept when pruning user programs on new project. */
function isShippedSamplePath(rel) {
  const p = sanitizeRel(rel);
  if (/^(logic|modbus|mqtt|opta)\/\d{2}_/i.test(p)) return true;
  if (/^opta-mqtt\//i.test(p)) return true;
  if (p === 'program.st') return true;
  return false;
}

function removeEmptyDirs(rootDir) {
  if (!fs.existsSync(rootDir)) return;
  for (const name of fs.readdirSync(rootDir)) {
    const full = path.join(rootDir, name);
    if (!fs.statSync(full).isDirectory()) continue;
    removeEmptyDirs(full);
    try {
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Delete .st files except the active path (and shipped samples by default).
 * @param {string} keepRel relative path under st/
 * @param {{ protectShipped?: boolean, stRoot?: string }} [opts]
 */
function pruneProgramsExcept(keepRel, opts = {}) {
  const keep = sanitizeRel(keepRel);
  const protectShipped = opts.protectShipped !== false;
  const root = path.resolve(opts.stRoot || stDir());
  for (const { path: rel } of listProgramsInRoot(root)) {
    if (rel === keep) continue;
    if (protectShipped && isShippedSamplePath(rel)) continue;
    const fp = path.join(root, ...rel.split('/'));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  removeEmptyDirs(root);
}

function warnLegacyDataSt() {
  const legacy = path.join(require('../config').DATA_DIR, 'st');
  if (path.resolve(legacy) === path.resolve(stDir())) return;
  try {
    if (fs.existsSync(legacy) && fs.readdirSync(legacy).some((n) => n.endsWith('.st'))) {
      console.warn(
        `[programs] Legacy ${legacy} is ignored. Use ${stDir()} (set PEAKLOGIC_ST to override).`
      );
    }
  } catch {
    /* ignore */
  }
}

function migrateLegacyProgram() {
  warnLegacyDataSt();
  ensureStDir();
  const stMain = resolvePath(DEFAULT_PROGRAM);
  if (fs.existsSync(stMain)) return;
  const legacyFp = persistence.filePath('program.st');
  if (fs.existsSync(legacyFp)) {
    fs.copyFileSync(legacyFp, stMain);
  } else {
    fs.writeFileSync(stMain, '// Select a program from st/logic, st/mqtt, or st/modbus\n', 'utf8');
  }
}

module.exports = {
  ST_DIR: GLOBAL_ST_DIR,
  stDir,
  DEFAULT_PROGRAM,
  ensureStDir,
  sanitizeRel,
  isValidProgramRel,
  resolvePath,
  activeRel,
  activeRelFromWorkspace,
  ensureActiveProgram,
  setActive,
  clearActive,
  readActive,
  writeActive,
  programExists,
  suggestRelFromFilename,
  saveToPath,
  readProgram,
  activeProgramMeta,
  writeProgram,
  listPrograms,
  listProgramsInRoot,
  isShippedSamplePath,
  pruneProgramsExcept,
  migrateLegacyProgram,
};

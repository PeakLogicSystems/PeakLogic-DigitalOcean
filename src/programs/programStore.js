'use strict';

const fs = require('fs');
const path = require('path');
const { ST_DIR, DEFAULT_PROGRAM } = require('../config');
const persistence = require('../persistence');

function ensureStDir() {
  if (!fs.existsSync(ST_DIR)) fs.mkdirSync(ST_DIR, { recursive: true });
}

function sanitizeRel(rel) {
  const norm = path.normalize(rel || '').replace(/^(\.\.(\/|\\|$))+/, '');
  return norm.replace(/\\/g, '/');
}

function resolvePath(rel) {
  ensureStDir();
  return path.join(ST_DIR, sanitizeRel(rel));
}

function activeRel() {
  const s = persistence.readJson('settings.json', {});
  return sanitizeRel(s.activeProgram || DEFAULT_PROGRAM);
}

function setActive(rel) {
  const s = persistence.readJson('settings.json', {});
  s.activeProgram = sanitizeRel(rel);
  persistence.writeJson('settings.json', s);
  return s.activeProgram;
}

function readActive() {
  return readProgram(activeRel());
}

function writeActive(source) {
  writeProgram(activeRel(), source);
}

function programExists(rel) {
  return fs.existsSync(resolvePath(rel));
}

function readProgram(rel) {
  const fp = resolvePath(rel);
  if (!fs.existsSync(fp)) return '';
  return fs.readFileSync(fp, 'utf8');
}

function writeProgram(rel, source) {
  const fp = resolvePath(rel);
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

function listPrograms() {
  ensureStDir();
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
          path: rel,
          name: name.replace(/\.st$/, ''),
          category: parts.length > 1 ? parts[0] : 'root',
        });
      }
    }
  }
  walk(ST_DIR, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function warnLegacyDataSt() {
  const legacy = path.join(require('../config').DATA_DIR, 'st');
  if (path.resolve(legacy) === path.resolve(ST_DIR)) return;
  try {
    if (fs.existsSync(legacy) && fs.readdirSync(legacy).some((n) => n.endsWith('.st'))) {
      console.warn(
        `[programs] Legacy ${legacy} is ignored. Use ${ST_DIR} (set PEAKLOGIC_ST to override).`
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
  ST_DIR,
  DEFAULT_PROGRAM,
  ensureStDir,
  sanitizeRel,
  resolvePath,
  activeRel,
  setActive,
  readActive,
  writeActive,
  programExists,
  suggestRelFromFilename,
  saveToPath,
  readProgram,
  writeProgram,
  listPrograms,
  migrateLegacyProgram,
};

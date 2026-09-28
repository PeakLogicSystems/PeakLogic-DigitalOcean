'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const programStore = require('../programs/programStore');
const persistence = require('../persistence');
const { DATA_DIR } = require('../config');
const { userImportsDir, saveUserHmiAsset } = require('../hmi/hmiUserAssets');
const { mvDrawAssetRefs, defaultReadAsset, defaultWriteAsset } = require('./projectBundle');
const { normalizeMvDraw } = require('../../mv-draw/src/mvDrawFormat');
const { packProjectDoc, applyProjectDoc, exportFilename, EST_FORMAT, EST_VERSION, ARCHIVE_FORMAT, ARCHIVE_VERSION } = require('./estFile');
const { stripLegacyProjectHwDefaults } = require('../settings/portableSettings');

const ZIP_EXT = '.est.zip';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function archiveFilename(name) {
  const base = String(name || 'project').trim().replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'project';
  return `${base}${ZIP_EXT}`;
}

function isZipBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function normalizeZipPath(name) {
  return String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function readZipMember(files, memberPath) {
  const key = normalizeZipPath(memberPath);
  const data = files[key];
  if (!data) return null;
  return Buffer.from(data);
}

function parseJsonMember(files, memberPath, fallback = null) {
  const buf = readZipMember(files, memberPath);
  if (!buf) return fallback;
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error(`Invalid JSON in archive member: ${memberPath}`), { status: 400 });
  }
}

function collectReferencedUserHmiFilenames(settings) {
  const refs = new Set();
  const json = JSON.stringify(settings?.hmi || settings || {});
  const re = /\/hmi\/user\/([^"'\\]+)/g;
  let match;
  while ((match = re.exec(json))) {
    try {
      refs.add(decodeURIComponent(match[1]));
    } catch {
      refs.add(match[1]);
    }
  }
  return [...refs];
}

function collectUserHmiAssets(settings, dataDir = DATA_DIR) {
  const dir = userImportsDir(dataDir);
  const assets = [];
  for (const name of collectReferencedUserHmiFilenames(settings)) {
    const fp = path.join(dir, path.basename(name));
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) continue;
    assets.push({ name: path.basename(name), data: fs.readFileSync(fp) });
  }
  return assets;
}

function attachMvDraw(deps) {
  try {
    const { readActiveProject } = require('../../mv-draw/src/mvDrawStore');
    const active = readActiveProject();
    if (active && (active.nodes?.length || active.background || active.scale)) {
      return normalizeMvDraw(active);
    }
    const ws = persistence.readJson('workspace.est.json', null);
    const pe = persistence.readJson('project.est.json', null);
    return normalizeMvDraw(ws?.mvDraw || pe?.mvDraw || null);
  } catch {
    return null;
  }
}

function collectMvDrawAssets(doc, readAsset = defaultReadAsset) {
  const assets = [];
  if (!doc) return assets;
  for (const ref of mvDrawAssetRefs(doc)) {
    const buf = readAsset(ref);
    if (!buf || !buf.length) continue;
    assets.push({ ref: normalizeZipPath(`mv-draw/${ref}`), data: buf });
  }
  return assets;
}

function extractHostHints(projectDoc) {
  const doc = projectDoc && typeof projectDoc === 'object' ? JSON.parse(JSON.stringify(projectDoc)) : {};
  const hints = {
    drivers: [],
    mqttParc: null,
    cloudRemote: null,
    cellularSims: null,
    mongoLogger: null,
  };

  if (Array.isArray(doc.drivers)) {
    hints.drivers = doc.drivers.map((d) => ({
      id: d.id,
      serialPort: d.serialPort || null,
      host: d.host || null,
      port: d.port ?? null,
      brokerUrl: d.brokerUrl || null,
      deviceId: d.deviceId || null,
    }));
    doc.drivers = doc.drivers.map((d) => {
      const next = { ...d };
      if (next.type === 'modbus_rtu' || next.type === 'vgreen_epc') {
        delete next.serialPort;
      }
      if (next.type === 'modbus_tcp' || next.type === 'mqtt' || next.type === 'mqtt_parc') {
        delete next.host;
        delete next.port;
        delete next.brokerUrl;
      }
      if (next.type === 'mqtt_parc') delete next.deviceId;
      return next;
    });
  }

  const settings = doc.settings && typeof doc.settings === 'object' ? { ...doc.settings } : null;
  if (settings) {
    if (settings.mongoLogger) {
      hints.mongoLogger = { ...settings.mongoLogger };
      delete settings.mongoLogger;
    }
    if (settings.mqttParc) {
      hints.mqttParc = { ...settings.mqttParc };
      delete settings.mqttParc;
    }
    if (settings.cloudRemote) {
      hints.cloudRemote = { ...settings.cloudRemote };
      delete settings.cloudRemote;
    }
    if (settings.cellularSims) {
      hints.cellularSims = { vendors: (settings.cellularSims.vendors || []).map((v) => ({ id: v.id, name: v.name })) };
      delete settings.cellularSims;
    }
    delete settings.defaults;
    doc.settings = settings;
  }

  if (doc.cameras?.cameras) {
    hints.cameras = doc.cameras.cameras.map((c) => ({
      id: c.id,
      onvifUrl: c.onvifUrl || null,
      rtspUrl: c.rtspUrl || null,
    }));
    doc.cameras = {
      ...doc.cameras,
      cameras: doc.cameras.cameras.map((c) => {
        const next = { ...c };
        if (next.rtspUrl) next.rtspUrl = '';
        if (next.onvifUrl) next.onvifUrl = '';
        return next;
      }),
    };
  }

  return { project: doc, hostHints: hints };
}

function buildProgramsManifest(programSources, activeRel) {
  const active = programStore.sanitizeRel(activeRel || programStore.activeRel());
  const files = Object.entries(programSources).map(([relPath, source]) => {
    const buf = Buffer.from(String(source || ''), 'utf8');
    return { path: programStore.sanitizeRel(relPath), sha256: sha256(buf), active: false };
  }).sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of files) {
    entry.active = entry.path === active;
  }
  if (active && !files.some((f) => f.path === active)) {
    files.push({ path: active, sha256: sha256(Buffer.from('', 'utf8')), active: true });
  }
  return { active: active || files.find((f) => f.active)?.path || files[0]?.path || '', files };
}

function collectProgramSources() {
  const out = {};
  for (const { path: rel } of programStore.listPrograms()) {
    out[rel] = programStore.readProgram(rel);
  }
  const active = programStore.activeRel();
  if (active && out[active] == null) out[active] = programStore.readProgram(active);
  return out;
}

function packArchive(deps, meta = {}, io = {}) {
  const readAsset = io.readAsset || defaultReadAsset;
  const projectDoc = packProjectDoc(deps, meta);
  const mvDraw = attachMvDraw(deps) || projectDoc.mvDraw || null;
  if (mvDraw) projectDoc.mvDraw = mvDraw;
  const parc = persistence.readJson('parc.json', null);
  const programSources = collectProgramSources();
  const programsManifest = buildProgramsManifest(programSources, projectDoc.activeProgram);
  const { project, hostHints } = extractHostHints(projectDoc);
  const hmiAssets = collectUserHmiAssets(project.settings);
  const mvDrawAssets = collectMvDrawAssets(mvDraw, readAsset);

  const manifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    projectName: project.project?.name || meta.name || 'project',
    exportedAt: new Date().toISOString(),
    exportedBy: meta.exportedBy || null,
    members: ['manifest.json', 'project.json', 'programs/manifest.json'],
  };

  const zipEntries = {};
  zipEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  zipEntries['project.json'] = strToU8(JSON.stringify(project, null, 2));
  zipEntries['programs/manifest.json'] = strToU8(JSON.stringify(programsManifest, null, 2));
  manifest.members.push('meta/host-hints.json');
  zipEntries['meta/host-hints.json'] = strToU8(JSON.stringify(hostHints, null, 2));

  for (const [relPath, source] of Object.entries(programSources)) {
    const member = normalizeZipPath(`programs/${relPath}`);
    zipEntries[member] = strToU8(String(source || ''));
    manifest.members.push(member);
  }

  if (hmiAssets.length) {
    manifest.members.push('hmi/user-imports/');
    for (const asset of hmiAssets) {
      const member = normalizeZipPath(`hmi/user-imports/${asset.name}`);
      zipEntries[member] = new Uint8Array(asset.data);
      manifest.members.push(member);
    }
  }

  if (mvDraw) {
    manifest.members.push('mv-draw/doc.json');
    zipEntries['mv-draw/doc.json'] = strToU8(JSON.stringify(mvDraw, null, 2));
    for (const asset of mvDrawAssets) {
      zipEntries[asset.ref] = new Uint8Array(asset.data);
      manifest.members.push(asset.ref);
    }
  }

  if (parc) {
    manifest.members.push('parc.json');
    zipEntries['parc.json'] = strToU8(JSON.stringify(parc, null, 2));
  }

  zipEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return Buffer.from(zipSync(zipEntries, { level: 6 }));
}

function unpackArchive(buf) {
  if (!isZipBuffer(buf)) {
    throw Object.assign(new Error('Expected a PeakLogic project archive (.est.zip)'), { status: 400 });
  }
  let files;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch (e) {
    throw Object.assign(new Error(`Invalid project archive: ${e.message || e}`), { status: 400 });
  }

  const project = parseJsonMember(files, 'project.json');
  let manifest = parseJsonMember(files, 'manifest.json');
  // Older ensure-bundled / export zips omitted format/version — accept if project.json is EST.
  if ((!manifest || !manifest.format) && project?.format === EST_FORMAT) {
    manifest = {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      projectName: project.project?.name || manifest?.projectName || 'project',
      exportedAt: project.savedAt || manifest?.exportedAt || null,
      exportedBy: manifest?.exportedBy || null,
      members: manifest?.members || Object.keys(files),
    };
  }
  if (!manifest || manifest.format !== ARCHIVE_FORMAT) {
    throw Object.assign(new Error(`Expected archive format "${ARCHIVE_FORMAT}"`), { status: 400 });
  }
  if (manifest.version != null && Number(manifest.version) !== ARCHIVE_VERSION) {
    throw Object.assign(new Error(`Unsupported archive version ${manifest.version}`), { status: 400 });
  }

  const programsManifest = parseJsonMember(files, 'programs/manifest.json', { active: '', files: [] });
  const hostHints = parseJsonMember(files, 'meta/host-hints.json', null);
  const parc = parseJsonMember(files, 'parc.json', null);
  const mvDraw = parseJsonMember(files, 'mv-draw/doc.json', null);

  const programs = {};
  for (const entry of programsManifest.files || []) {
    const rel = programStore.sanitizeRel(entry.path);
    const member = normalizeZipPath(`programs/${rel}`);
    const sourceBuf = readZipMember(files, member);
    if (!sourceBuf) continue;
    programs[rel] = sourceBuf.toString('utf8');
  }

  const hmiAssets = [];
  for (const key of Object.keys(files)) {
    const norm = normalizeZipPath(key);
    if (!norm.startsWith('hmi/user-imports/')) continue;
    const name = path.basename(norm);
    hmiAssets.push({ name, data: Buffer.from(files[key]) });
  }

  const mvDrawAssets = [];
  for (const key of Object.keys(files)) {
    const norm = normalizeZipPath(key);
    if (!norm.startsWith('mv-draw/uploads/')) continue;
    mvDrawAssets.push({ ref: norm.replace(/^mv-draw\//, ''), data: Buffer.from(files[key]) });
  }

  return {
    manifest,
    project,
    programsManifest,
    programs,
    hostHints,
    parc,
    mvDraw,
    hmiAssets,
    mvDrawAssets,
  };
}

async function restoreArchiveMembers(unpacked, io = {}) {
  const writeAsset = io.writeAsset || defaultWriteAsset;
  const warnings = [];

  for (const asset of unpacked.hmiAssets || []) {
    const saved = saveUserHmiAsset(DATA_DIR, asset.name, asset.data);
    if (!saved.ok) warnings.push(`Could not restore HMI asset ${asset.name}: ${saved.error}`);
  }

  for (const asset of unpacked.mvDrawAssets || []) {
    try {
      writeAsset(asset.ref, asset.data);
    } catch (e) {
      warnings.push(`Could not restore MV Draw asset ${asset.ref}: ${e.message || e}`);
    }
  }

  if (unpacked.mvDraw) {
    try {
      const { writeActiveProject } = require('../../mv-draw/src/mvDrawStore');
      writeActiveProject(normalizeMvDraw(unpacked.mvDraw));
    } catch (e) {
      warnings.push(`Could not restore MV Draw document: ${e.message || e}`);
    }
  }

  if (unpacked.parc) {
    persistence.writeJson('parc.json', unpacked.parc);
  }

  return warnings;
}

async function applyArchive(unpacked, deps, opts = {}) {
  const restoreWarnings = await restoreArchiveMembers(unpacked, opts.io || {});
  const out = await applyProjectDoc(unpacked.project, deps, {
    ...opts,
    programs: unpacked.programs,
    programsManifest: unpacked.programsManifest,
  });
  const importWarnings = [...restoreWarnings, ...(out.importWarnings || [])];
  if (unpacked.hostHints?.drivers?.length) {
    importWarnings.push(
      ...unpacked.hostHints.drivers
        .filter((h) => h.serialPort || h.host)
        .map((h) => `Host hint: driver ${h.id} was ${h.serialPort || h.host || 'configured on source'} — verify on this machine`),
    );
  }
  return { ...out, importWarnings };
}

async function applyArchiveBuffer(buf, deps, opts = {}) {
  const unpacked = unpackArchive(buf);
  return applyArchive(unpacked, deps, opts);
}

function parseImportJsonBuffer(buf) {
  let raw;
  try {
    raw = JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid project JSON'), { status: 400 });
  }
  const { resolveImportPayload } = require('./projectBundle');
  const { type, doc, warnings } = resolveImportPayload(raw);
  if (type !== 'est') {
    throw Object.assign(new Error('Expected a PeakLogic project file (.est.json or .est.zip)'), { status: 400 });
  }
  return { doc, warnings: warnings || [] };
}

function legacyProgramsFromDoc(doc) {
  const programs = {};
  let activeProgram = programStore.sanitizeRel(doc.activeProgram || '');
  if (typeof doc.program === 'string' && doc.program.trim()) {
    const rel = activeProgram
      || programStore.suggestRelFromFilename(`${doc.project?.name || 'project'}.st`);
    programs[rel] = doc.program;
    activeProgram = rel;
  }
  return { programs, activeProgram };
}

/** Accept .est.zip or legacy .est.json / .mvbundle JSON and load into runtime. */
async function applyImportBuffer(buf, deps, opts = {}) {
  if (isZipBuffer(buf)) {
    return applyArchiveBuffer(buf, deps, opts);
  }
  const { doc: rawDoc, warnings: parseWarnings } = parseImportJsonBuffer(buf);
  const doc = { ...rawDoc };
  if (!doc.format && Array.isArray(doc.tags)) {
    doc.format = EST_FORMAT;
    doc.version = doc.version || EST_VERSION;
  }
  const { programs, activeProgram } = legacyProgramsFromDoc(doc);
  delete doc.program;
  const programOpts = Object.keys(programs).length
    ? {
      programs,
      programsManifest: {
        active: activeProgram,
        files: Object.keys(programs).map((path) => ({ path })),
      },
    }
    : {};
  const out = await applyProjectDoc(doc, deps, { ...opts, ...programOpts });
  return {
    ...out,
    importWarnings: [...parseWarnings, ...(out.importWarnings || [])],
  };
}

/** Build a portable archive from explicit parts (generate-est scripts, CI). */
function packArchiveFromParts({
  project,
  programs = {},
  activeProgram = '',
  parc = null,
  mvDraw = null,
  hmiAssets = [],
  mvDrawAssets = [],
  meta = {},
}) {
  const { project: sanitized, hostHints } = extractHostHints(project);
  const programsManifest = buildProgramsManifest(programs, activeProgram || sanitized.activeProgram);
  const manifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    projectName: sanitized.project?.name || meta.name || 'project',
    exportedAt: new Date().toISOString(),
    exportedBy: meta.exportedBy || null,
    members: ['manifest.json', 'project.json', 'programs/manifest.json', 'meta/host-hints.json'],
  };
  const zipEntries = {};
  zipEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  zipEntries['project.json'] = strToU8(JSON.stringify(sanitized, null, 2));
  zipEntries['programs/manifest.json'] = strToU8(JSON.stringify(programsManifest, null, 2));
  zipEntries['meta/host-hints.json'] = strToU8(JSON.stringify(hostHints, null, 2));
  for (const [relPath, source] of Object.entries(programs)) {
    const member = normalizeZipPath(`programs/${relPath}`);
    zipEntries[member] = strToU8(String(source || ''));
    manifest.members.push(member);
  }
  for (const asset of hmiAssets) {
    const member = normalizeZipPath(`hmi/user-imports/${asset.name}`);
    zipEntries[member] = new Uint8Array(asset.data);
    manifest.members.push(member);
  }
  if (mvDraw) {
    zipEntries['mv-draw/doc.json'] = strToU8(JSON.stringify(mvDraw, null, 2));
    manifest.members.push('mv-draw/doc.json');
  }
  for (const asset of mvDrawAssets) {
    const member = normalizeZipPath(asset.ref.startsWith('mv-draw/') ? asset.ref : `mv-draw/${asset.ref}`);
    zipEntries[member] = new Uint8Array(asset.data);
    manifest.members.push(member);
  }
  if (parc) {
    zipEntries['parc.json'] = strToU8(JSON.stringify(parc, null, 2));
    manifest.members.push('parc.json');
  }
  zipEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return Buffer.from(zipSync(zipEntries, { level: 6 }));
}

module.exports = {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  ZIP_EXT,
  archiveFilename,
  isZipBuffer,
  packArchive,
  packArchiveFromParts,
  unpackArchive,
  applyArchive,
  applyArchiveBuffer,
  applyImportBuffer,
  restoreArchiveMembers,
  extractHostHints,
  collectProgramSources,
  collectUserHmiAssets,
};

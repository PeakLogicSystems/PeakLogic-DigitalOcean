'use strict';

const fs = require('fs');
const path = require('path');
const { EST_FORMAT } = require('./estFile');
const { FACILITY_DRAW_FORMAT, normalizeFacilityDraw } = require('../../facility-draw/src/facilityDrawFormat');
const { resolveUpload, uploadsDir, relativeUploadPath } = require('../../facility-draw/src/facilityDrawStore');

const BUNDLE_FORMAT = 'peaklogic-bundle';
const BUNDLE_VERSION = 1;

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.dxf': 'application/dxf',
};

function isBundle(raw) {
  return raw && typeof raw === 'object' && raw.format === BUNDLE_FORMAT;
}

function bundleFilename(name) {
  const base = String(name || 'project').trim().replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'project';
  return `${base}.mvbundle`;
}

function normalizeAssetRef(ref) {
  const base = path.basename(String(ref || '').replace(/^uploads[/\\]/, ''));
  if (!base) return null;
  return `uploads/${base}`;
}

function facilityDrawAssetRefs(doc) {
  const refs = [];
  const bgPath = doc?.background?.path;
  if (!bgPath) return refs;
  const ref = normalizeAssetRef(bgPath);
  if (ref) refs.push(ref);
  return refs;
}

function mimeFromRef(ref) {
  return MIME_BY_EXT[path.extname(ref).toLowerCase()] || 'application/octet-stream';
}

function defaultReadAsset(ref) {
  const normalized = normalizeAssetRef(ref);
  if (!normalized) return null;
  const full = resolveUpload(normalized);
  if (!full || !fs.existsSync(full)) return null;
  return fs.readFileSync(full);
}

function defaultWriteAsset(ref, buf) {
  const normalized = normalizeAssetRef(ref);
  if (!normalized) throw new Error('Invalid asset path');
  const base = path.basename(normalized);
  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, base);
  if (!full.startsWith(dir)) throw new Error('Invalid asset path');
  fs.writeFileSync(full, buf);
  return relativeUploadPath(base);
}

function collectAssets(doc, readAsset = defaultReadAsset) {
  const assets = [];
  const seen = new Set();
  for (const ref of facilityDrawAssetRefs(doc)) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const buf = readAsset(ref);
    if (!buf || !buf.length) continue;
    assets.push({
      ref,
      mime: mimeFromRef(ref),
      base64: buf.toString('base64'),
    });
  }
  return assets;
}

function packFacilityDraw(doc, meta = {}, io = {}) {
  const readAsset = io.readAsset || defaultReadAsset;
  const normalized = normalizeFacilityDraw(doc, meta);
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    kind: 'facilitydraw',
    name: normalized.name,
    savedAt: new Date().toISOString(),
    exportedBy: meta.exportedBy || null,
    doc: normalized,
    assets: collectAssets(normalized, readAsset),
  };
}

function packEst(estDoc, meta = {}, io = {}) {
  const readAsset = io.readAsset || defaultReadAsset;
  const doc = estDoc && typeof estDoc === 'object' ? { ...estDoc } : {};
  const name = String(doc.project?.name || doc.settings?.project?.name || meta.name || 'project').trim() || 'project';
  const assets = doc.facilityDraw ? collectAssets(doc.facilityDraw, readAsset) : [];
  let cameras = doc.cameras;
  if (!cameras) {
    try {
      const { registry } = require('../cameras/cameraRegistry');
      cameras = registry.exportForProject();
    } catch {
      cameras = null;
    }
  }
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    kind: 'est',
    name,
    savedAt: new Date().toISOString(),
    exportedBy: meta.exportedBy || doc.exportedBy || doc.appVersion || null,
    doc,
    assets,
    cameras,
  };
}

function unpackBundle(bundle, io = {}) {
  if (!isBundle(bundle)) {
    return { kind: null, doc: bundle, warnings: [] };
  }
  if (bundle.version !== BUNDLE_VERSION) {
    throw Object.assign(new Error(`Unsupported bundle version ${bundle.version}`), { status: 400 });
  }
  const writeAsset = io.writeAsset || defaultWriteAsset;
  const warnings = [];
  for (const asset of Array.isArray(bundle.assets) ? bundle.assets : []) {
    const ref = normalizeAssetRef(asset?.ref);
    const b64 = String(asset?.base64 || '');
    if (!ref || !b64) continue;
    try {
      writeAsset(ref, Buffer.from(b64, 'base64'));
    } catch (e) {
      warnings.push(`Could not restore ${ref}: ${e.message || e}`);
    }
  }
  if (!bundle.doc || typeof bundle.doc !== 'object') {
    throw Object.assign(new Error('Bundle is missing doc'), { status: 400 });
  }
  if (bundle.cameras) {
    try {
      const { registry } = require('../cameras/cameraRegistry');
      registry.importFromProject(bundle.cameras);
    } catch (e) {
      warnings.push(`Could not restore cameras: ${e.message || e}`);
    }
  }
  return {
    kind: String(bundle.kind || '').trim() || null,
    doc: bundle.doc,
    warnings,
  };
}

/** Accept bundle, est, or facilitydraw JSON and return the inner document for import. */
function resolveImportPayload(raw, io = {}) {
  if (!raw || typeof raw !== 'object') {
    throw Object.assign(new Error('Invalid JSON object'), { status: 400 });
  }
  if (isBundle(raw)) {
    const { kind, doc, warnings } = unpackBundle(raw, io);
    if (kind === 'facilitydraw' || doc?.format === FACILITY_DRAW_FORMAT) {
      return { type: 'facilitydraw', doc: normalizeFacilityDraw(doc), warnings };
    }
    if (kind === 'est' || doc?.format === EST_FORMAT) {
      return { type: 'est', doc, warnings };
    }
    throw Object.assign(new Error('Bundle doc is not a PeakLogic or Facility Builder project'), { status: 400 });
  }
  if (raw.format === FACILITY_DRAW_FORMAT) {
    return { type: 'facilitydraw', doc: normalizeFacilityDraw(raw), warnings: [] };
  }
  if (raw.format === EST_FORMAT || Array.isArray(raw.tags)) {
    return { type: 'est', doc: raw, warnings: [] };
  }
  throw Object.assign(new Error('Unrecognized project file (expected .mvbundle, .est.json, or .facilitydraw.json)'), { status: 400 });
}

module.exports = {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  isBundle,
  bundleFilename,
  packFacilityDraw,
  packEst,
  unpackBundle,
  resolveImportPayload,
  facilityDrawAssetRefs,
  defaultReadAsset,
  defaultWriteAsset,
};

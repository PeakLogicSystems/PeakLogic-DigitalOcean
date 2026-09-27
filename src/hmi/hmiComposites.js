'use strict';

const fs = require('fs');
const path = require('path');

const COMPOSITE_PATH_PREFIX = '@composite/';

/**
 * @typedef {object} HmiCompositePart
 * @property {string} svg
 * @property {number} [z]
 * @property {string} [kind]
 * @property {string} [role]
 */

/**
 * @typedef {object} HmiCompositeManifest
 * @property {string} id
 * @property {string} [label]
 * @property {string} [group]
 * @property {string} [subgroup]
 * @property {string} [preview]
 * @property {string} [defaultTagId]
 * @property {Record<string, { pick?: string, types?: string[] }>} [tagRoles]
 * @property {HmiCompositePart[]} parts
 * @property {object[]} defaultBindings
 */

function normalizePart(raw, publicRoot) {
  const svg = String(raw?.svg || '').trim();
  if (!svg) return null;
  const { resolveAssetPath } = require('./hmiConfig');
  const resolved = publicRoot ? resolveAssetPath(publicRoot, svg) : svg;
  const z = Math.max(0, Math.min(4, Number.isFinite(Number(raw?.z)) ? Number(raw.z) : 0));
  const kind = String(raw?.kind || 'staticImage').trim();
  const role = String(raw?.role || raw?.elementId || '').trim();
  return { svg: resolved, z, kind, role };
}

function normalizeBindingDef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const elementId = String(raw.elementId || raw.role || '').trim();
  const property = String(raw.property || '').trim();
  if (!elementId || !property) return null;
  const out = {
    elementId,
    property,
    tagRole: String(raw.tagRole || 'pv').trim() || 'pv',
  };
  if (raw.min != null && Number.isFinite(Number(raw.min))) out.min = Number(raw.min);
  if (raw.max != null && Number.isFinite(Number(raw.max))) out.max = Number(raw.max);
  if (raw.format != null) out.format = String(raw.format);
  if (raw.onValue != null) out.onValue = raw.onValue;
  if (raw.offValue != null) out.offValue = raw.offValue;
  return out;
}

/** @returns {HmiCompositeManifest|null} */
function normalizeManifest(raw, id, publicRoot) {
  if (!raw || typeof raw !== 'object') return null;
  const manifestId = String(raw.id || id || '').trim();
  if (!manifestId) return null;
  const parts = (Array.isArray(raw.parts) ? raw.parts : [])
    .map((p) => normalizePart(p, publicRoot))
    .filter(Boolean);
  if (!parts.length) return null;
  const defaultBindings = (Array.isArray(raw.defaultBindings) ? raw.defaultBindings : [])
    .map(normalizeBindingDef)
    .filter(Boolean);
  return {
    id: manifestId,
    label: String(raw.label || manifestId).trim(),
    group: String(raw.group || 'Gauges & meters').trim(),
    subgroup: String(raw.subgroup || 'composites').trim(),
    preview: raw.preview ? (publicRoot ? require('./hmiConfig').resolveAssetPath(publicRoot, String(raw.preview)) : String(raw.preview)) : parts[0].svg,
    defaultTagId: String(raw.defaultTagId || '').trim(),
    tagRoles: raw.tagRoles && typeof raw.tagRoles === 'object' ? raw.tagRoles : { pv: { pick: 'firstNumeric', types: ['REAL', 'INT'] } },
    parts,
    defaultBindings,
  };
}

function compositesDir(publicRoot) {
  return path.join(publicRoot, 'hmi', 'svg', 'composites');
}

/** @param {string} publicRoot */
function listHmiComposites(publicRoot) {
  const dir = compositesDir(publicRoot);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/\.json$/i.test(name) || name.toLowerCase() === 'index.json') continue;
    const fp = path.join(dir, name);
    if (!fs.statSync(fp).isFile()) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const id = name.replace(/\.json$/i, '');
      const manifest = normalizeManifest(raw, id, publicRoot);
      if (!manifest) continue;
      out.push({
        path: `${COMPOSITE_PATH_PREFIX}${manifest.id}`,
        name: `${manifest.id}.json`,
        type: 'composite',
        group: manifest.group,
        subgroup: manifest.subgroup,
        vendor: 'peaklogic',
        label: manifest.label,
        preview: manifest.preview,
        composite: manifest,
      });
    } catch { /* skip invalid manifest */ }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function compositePathFromId(id) {
  return `${COMPOSITE_PATH_PREFIX}${String(id || '').trim()}`;
}

function compositeIdFromPath(assetPath) {
  const p = String(assetPath || '').trim();
  if (!p.startsWith(COMPOSITE_PATH_PREFIX)) return '';
  return p.slice(COMPOSITE_PATH_PREFIX.length);
}

module.exports = {
  COMPOSITE_PATH_PREFIX,
  listHmiComposites,
  normalizeManifest,
  compositePathFromId,
  compositeIdFromPath,
};

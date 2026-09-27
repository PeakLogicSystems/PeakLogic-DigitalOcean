'use strict';

const { normalizeExtents } = require('./extents');

const MV_DRAW_FORMAT = 'peaklogic-mvdraw';
const MV_DRAW_VERSION = 1;
const UNITS = new Set(['ft', 'm']);

function blankFacilityDoc(meta = {}) {
  const name = String(meta.name || 'untitled').trim() || 'untitled';
  return {
    format: MV_DRAW_FORMAT,
    version: MV_DRAW_VERSION,
    savedAt: new Date().toISOString(),
    name,
    units: 'ft',
    scale: null,
    extents: null,
    background: null,
    nodes: [],
    edges: [],
    annotations: [],
    meta: {
      client: meta.client || '',
      site: meta.site || '',
      notes: meta.notes || '',
    },
  };
}

function normalizeScale(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ppu = Number(raw.pixelsPerUnit);
  if (!Number.isFinite(ppu) || ppu <= 0) return null;
  return {
    method: raw.method === 'twoPoint' ? 'twoPoint' : 'known',
    pixelsPerUnit: ppu,
    unitLabel: UNITS.has(raw.unitLabel) ? raw.unitLabel : 'ft',
    p1: Array.isArray(raw.p1) && raw.p1.length === 2 ? [+raw.p1[0], +raw.p1[1]] : null,
    p2: Array.isArray(raw.p2) && raw.p2.length === 2 ? [+raw.p2[0], +raw.p2[1]] : null,
    distance: Number.isFinite(+raw.distance) ? +raw.distance : null,
  };
}

function normalizeNode(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || `node_${index + 1}`).trim();
  const type = String(raw.type || '').trim();
  if (!type) return null;
  return {
    id,
    type,
    x: Number.isFinite(+raw.x) ? +raw.x : 0,
    y: Number.isFinite(+raw.y) ? +raw.y : 0,
    rotation: Number.isFinite(+raw.rotation) ? +raw.rotation : 0,
    label: String(raw.label || '').slice(0, 120),
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
  };
}

function normalizeEdge(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || `edge_${index + 1}`).trim();
  const from = String(raw.from || '').trim();
  const to = String(raw.to || '').trim();
  if (!from || !to) return null;
  const points = Array.isArray(raw.points)
    ? raw.points
      .filter((p) => Array.isArray(p) && p.length === 2)
      .map((p) => [+p[0], +p[1]])
    : [];
  return {
    id,
    from,
    to,
    kind: String(raw.kind || 'pipe').slice(0, 40),
    points,
    label: String(raw.label || '').slice(0, 80),
  };
}

function normalizeBackground(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'image') {
    const path = String(raw.path || '').trim();
    if (!path) return null;
    return {
      type: 'image',
      path,
      opacity: Math.max(0.05, Math.min(1, +(raw.opacity ?? 0.55) || 0.55)),
      widthPx: Number.isFinite(+raw.widthPx) ? +raw.widthPx : null,
      heightPx: Number.isFinite(+raw.heightPx) ? +raw.heightPx : null,
    };
  }
  if (raw.type === 'dxf') {
    const path = String(raw.path || '').trim();
    if (!path) return null;
    return { type: 'dxf', path, opacity: Math.max(0.05, Math.min(1, +(raw.opacity ?? 0.7) || 0.7)) };
  }
  return null;
}

function normalizeFacility(raw, meta = {}) {
  const base = blankFacilityDoc(meta);
  if (!raw || typeof raw !== 'object') return base;
  const units = UNITS.has(raw.units) ? raw.units : base.units;
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : [])
    .map((n, i) => normalizeNode(n, i))
    .filter(Boolean);
  const edges = (Array.isArray(raw.edges) ? raw.edges : [])
    .map((e, i) => normalizeEdge(e, i))
    .filter(Boolean);
  return {
    format: MV_DRAW_FORMAT,
    version: MV_DRAW_VERSION,
    savedAt: raw.savedAt || new Date().toISOString(),
    name: String(raw.name || meta.name || base.name).trim() || base.name,
    units,
    scale: normalizeScale(raw.scale),
    extents: normalizeExtents(raw.extents),
    background: normalizeBackground(raw.background),
    nodes,
    edges,
    annotations: Array.isArray(raw.annotations) ? raw.annotations : [],
    meta: {
      client: String(raw.meta?.client || meta.client || '').slice(0, 200),
      site: String(raw.meta?.site || meta.site || '').slice(0, 200),
      notes: String(raw.meta?.notes || meta.notes || '').slice(0, 2000),
    },
  };
}

function validateFacility(doc) {
  if (!doc || typeof doc !== 'object') return 'Invalid project object';
  if (doc.format !== MV_DRAW_FORMAT) return `Expected format "${MV_DRAW_FORMAT}"`;
  if (doc.version !== MV_DRAW_VERSION) return `Unsupported version ${doc.version}`;
  if (!UNITS.has(doc.units)) return 'Invalid units';
  if (!Array.isArray(doc.nodes)) return 'Missing nodes array';
  if (!Array.isArray(doc.edges)) return 'Missing edges array';
  return null;
}

module.exports = {
  MV_DRAW_FORMAT,
  MV_DRAW_VERSION,
  blankFacilityDoc,
  normalizeFacility,
  validateFacility,
};

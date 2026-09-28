'use strict';

const { normalizeExtents } = require('./extents');
const { normalizeGroups } = require('./groups');

const FACILITY_DRAW_FORMAT = 'peaklogic-facilitydraw';
const FACILITY_DRAW_VERSION = 1;
const UNITS = new Set(['ft', 'm']);

function blankFacilityDrawDoc(meta = {}) {
  const name = String(meta.name || 'untitled').trim() || 'untitled';
  return {
    format: FACILITY_DRAW_FORMAT,
    version: FACILITY_DRAW_VERSION,
    savedAt: new Date().toISOString(),
    name,
    units: 'ft',
    scale: null,
    extents: null,
    background: null,
    nodes: [],
    edges: [],
    groups: [],
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
  const scaleX = Number.isFinite(+raw.scaleX) ? +raw.scaleX : 1;
  const scaleY = Number.isFinite(+raw.scaleY) ? +raw.scaleY : 1;
  return {
    id,
    type,
    x: Number.isFinite(+raw.x) ? +raw.x : 0,
    y: Number.isFinite(+raw.y) ? +raw.y : 0,
    rotation: Number.isFinite(+raw.rotation) ? +raw.rotation : 0,
    scaleX: scaleX > 0 ? Math.min(8, Math.max(0.2, scaleX)) : 1,
    scaleY: scaleY > 0 ? Math.min(8, Math.max(0.2, scaleY)) : 1,
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
    kind: String(raw.kind || 'src').slice(0, 40),
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

function normalizeFacilityDraw(raw, meta = {}) {
  const base = blankFacilityDrawDoc(meta);
  if (!raw || typeof raw !== 'object') return base;
  const units = UNITS.has(raw.units) ? raw.units : base.units;
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : [])
    .map((n, i) => normalizeNode(n, i))
    .filter(Boolean);
  const edges = (Array.isArray(raw.edges) ? raw.edges : [])
    .map((e, i) => normalizeEdge(e, i))
    .filter(Boolean);
  const groups = normalizeGroups(raw.groups);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const prunedGroups = groups
    .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => nodeIds.has(id)) }))
    .filter((g) => g.nodeIds.length >= 2);
  return {
    format: FACILITY_DRAW_FORMAT,
    version: FACILITY_DRAW_VERSION,
    savedAt: raw.savedAt || new Date().toISOString(),
    name: String(raw.name || meta.name || base.name).trim() || base.name,
    units,
    scale: normalizeScale(raw.scale),
    extents: normalizeExtents(raw.extents),
    background: normalizeBackground(raw.background),
    nodes,
    edges,
    groups: prunedGroups,
    annotations: Array.isArray(raw.annotations) ? raw.annotations : [],
    libraryFile: raw.libraryFile ? String(raw.libraryFile).replace(/^.*[/\\]/, '').slice(0, 120) : null,
    meta: {
      client: String(raw.meta?.client || meta.client || '').slice(0, 200),
      site: String(raw.meta?.site || meta.site || '').slice(0, 200),
      notes: String(raw.meta?.notes || meta.notes || '').slice(0, 2000),
      peaklogicProject: String(raw.meta?.peaklogicProject || meta.peaklogicProject || '').slice(0, 120),
    },
  };
}

function validateFacilityDraw(doc) {
  if (!doc || typeof doc !== 'object') return 'Invalid project object';
  if (doc.format !== FACILITY_DRAW_FORMAT) return `Expected format "${FACILITY_DRAW_FORMAT}"`;
  if (doc.version !== FACILITY_DRAW_VERSION) return `Unsupported version ${doc.version}`;
  if (!UNITS.has(doc.units)) return 'Invalid units';
  if (!Array.isArray(doc.nodes)) return 'Missing nodes array';
  if (!Array.isArray(doc.edges)) return 'Missing edges array';
  return null;
}

module.exports = {
  FACILITY_DRAW_FORMAT,
  FACILITY_DRAW_VERSION,
  blankFacilityDrawDoc,
  normalizeFacilityDraw,
  validateFacilityDraw,
};

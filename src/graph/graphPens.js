'use strict';

const { isGraphableTag } = require('../tags/graphableTags');

const MAX_GRAPH_PENS = 32;

const DEFAULT_COLORS = [
  '#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626',
  '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#0d9488',
];

function defaultColor(index) {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

function normalizePen(raw, index, validTagIds) {
  const tagId = String(raw?.tagId || raw?.id || '').trim();
  if (!tagId || (validTagIds && !validTagIds.has(tagId))) return null;
  const scale = Number(raw.scale);
  const ymin = Number(raw.ymin);
  const ymax = Number(raw.ymax);
  const offset = Number(raw.offset);
  return {
    tagId,
    color: /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : defaultColor(index),
    scale: Number.isFinite(scale) && scale !== 0 ? scale : 1,
    offset: Number.isFinite(offset) ? offset : 0,
    ymin: Number.isFinite(ymin) ? ymin : 0,
    ymax: Number.isFinite(ymax) ? ymax : 100,
    autoScale: raw.autoScale !== false && raw.autoScale !== 'false',
  };
}

/** @param {Array} pens @param {Array<{id:string,type:string}>} tags */
function normalizePens(pens, tags = []) {
  const valid = new Set((tags || []).filter(isGraphableTag).map((t) => t.id));
  const out = [];
  const seen = new Set();
  for (let i = 0; i < (pens || []).length && out.length < MAX_GRAPH_PENS; i++) {
    const p = normalizePen(pens[i], out.length, valid);
    if (!p || seen.has(p.tagId)) continue;
    seen.add(p.tagId);
    out.push(p);
  }
  return out;
}

function penTagIds(pens) {
  return (pens || []).map((p) => p.tagId);
}

function applyScaledValue(raw, pen) {
  return Number(raw) * (pen.scale || 1) + (pen.offset || 0);
}

module.exports = {
  MAX_GRAPH_PENS,
  DEFAULT_COLORS,
  defaultColor,
  normalizePens,
  penTagIds,
  applyScaledValue,
};

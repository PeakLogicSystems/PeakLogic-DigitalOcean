'use strict';

function extentsFromCorners(p1, p2, label) {
  if (!Array.isArray(p1) || p1.length !== 2 || !Array.isArray(p2) || p2.length !== 2) return null;
  const minX = Math.min(+p1[0], +p2[0]);
  const maxX = Math.max(+p1[0], +p2[0]);
  const minY = Math.min(+p1[1], +p2[1]);
  const maxY = Math.max(+p1[1], +p2[1]);
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX - minX < 0.01 || maxY - minY < 0.01) {
    return null;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    label: String(label || 'Drawing extents').slice(0, 120),
  };
}

function normalizeExtents(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.p1) && Array.isArray(raw.p2)) {
    return extentsFromCorners(raw.p1, raw.p2, raw.label);
  }
  const minX = +raw.minX;
  const minY = +raw.minY;
  const maxX = +raw.maxX;
  const maxY = +raw.maxY;
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  if (maxX <= minX || maxY <= minY) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    label: String(raw.label || 'Drawing extents').slice(0, 120),
  };
}

function extentsDimensions(ext, units = 'ft') {
  if (!ext) return null;
  return {
    width: ext.maxX - ext.minX,
    height: ext.maxY - ext.minY,
    units,
  };
}

function formatExtentsSize(ext, units = 'ft') {
  const d = extentsDimensions(ext, units);
  if (!d) return 'Not set';
  const w = d.width.toFixed(1);
  const h = d.height.toFixed(1);
  return `${w} × ${h} ${units}`;
}

/**
 * Bounds for export/view — prefers user-defined extents, else content bounds.
 * @param {object} project
 * @param {(doc: object) => object} contentBoundsFn
 */
function drawingBounds(project, contentBoundsFn) {
  const ext = normalizeExtents(project?.extents);
  if (ext) {
    const pad = 2;
    return {
      minX: ext.minX - pad,
      minY: ext.minY - pad,
      maxX: ext.maxX + pad,
      maxY: ext.maxY + pad,
      fromExtents: true,
    };
  }
  return contentBoundsFn(project);
}

module.exports = {
  normalizeExtents,
  extentsFromCorners,
  extentsDimensions,
  formatExtentsSize,
  drawingBounds,
};

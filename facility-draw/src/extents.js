'use strict';

const { worldSizeFromSheet, normalizeOrientation } = require('./sheetSizes');

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
  const sheetSize = raw.sheetSize ? String(raw.sheetSize).trim().toUpperCase().slice(0, 1) : null;
  const worldPerInch = Number.isFinite(+raw.worldPerInch) && +raw.worldPerInch > 0 ? +raw.worldPerInch : null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    label: String(raw.label || 'Drawing extents').slice(0, 120),
    ...(sheetSize ? { sheetSize } : {}),
    ...(worldPerInch != null ? { worldPerInch } : {}),
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
  const sheet = ext?.sheetSize ? ` · Sheet ${ext.sheetSize}` : '';
  const orient = ext?.orientation && ext.orientation !== 'landscape' ? ` · ${ext.orientation}` : '';
  return `${w} × ${h} ${units}${sheet}${orient}`;
}

/**
 * Plot boundary for export — swaps width/height when portrait is requested.
 * @param {object} project
 * @param {{ orientation?: string }} opts
 */
function exportPlotExtents(project, opts = {}) {
  const ext = normalizeExtents(project?.extents);
  if (!ext) return null;
  const orientation = normalizeOrientation(opts.orientation, 'landscape');
  if (ext.sheetSize) {
    const cx = (ext.minX + ext.maxX) / 2;
    const cy = (ext.minY + ext.maxY) / 2;
    const units = project?.units === 'm' ? 'm' : 'ft';
    const size = worldSizeFromSheet(ext.sheetSize, units, ext.worldPerInch);
    if (!size) return { ...ext, orientation };
    let width = size.width;
    let height = size.height;
    if (orientation === 'portrait') {
      const swap = width;
      width = height;
      height = swap;
    }
    return {
      minX: cx - width / 2,
      minY: cy - height / 2,
      maxX: cx + width / 2,
      maxY: cy + height / 2,
      label: ext.label,
      sheetSize: ext.sheetSize,
      worldPerInch: ext.worldPerInch,
      orientation,
    };
  }
  if (orientation === 'portrait') {
    const cx = (ext.minX + ext.maxX) / 2;
    const cy = (ext.minY + ext.maxY) / 2;
    const width = ext.maxX - ext.minX;
    const height = ext.maxY - ext.minY;
    if (width > height) {
      return {
        minX: cx - height / 2,
        minY: cy - width / 2,
        maxX: cx + height / 2,
        maxY: cy + width / 2,
        label: ext.label,
        orientation,
      };
    }
  }
  return { ...ext, orientation };
}

/**
 * Bounds for export/view — prefers user-defined extents, else content bounds.
 * @param {object} project
 * @param {(doc: object) => object} contentBoundsFn
 * @param {object|null} [plotExtentsOverride]
 */
function drawingBounds(project, contentBoundsFn, plotExtentsOverride = null) {
  const ext = normalizeExtents(plotExtentsOverride || project?.extents);
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
  exportPlotExtents,
  drawingBounds,
};

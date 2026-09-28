'use strict';

/** Architectural sheet sizes (landscape width × height in inches). */
const ARCH_SHEETS = {
  A: { widthIn: 12, heightIn: 9, label: 'Arch A' },
  B: { widthIn: 18, heightIn: 12, label: 'Arch B' },
  C: { widthIn: 24, heightIn: 18, label: 'Arch C' },
  D: { widthIn: 36, heightIn: 24, label: 'Arch D' },
};

const SHEET_KEYS = ['A', 'B', 'C', 'D'];

const DEFAULT_WORLD_PER_INCH = { ft: 10, m: 3 };

function normalizeSheetKey(key) {
  const k = String(key || '').trim().toUpperCase();
  return ARCH_SHEETS[k] ? k : null;
}

/** @returns {'landscape'|'portrait'} */
function normalizeOrientation(value, defaultOrient = 'landscape') {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'portrait' || v === 'p') return 'portrait';
  if (v === 'landscape' || v === 'l') return 'landscape';
  return defaultOrient === 'portrait' ? 'portrait' : 'landscape';
}

function applyOrientation(width, height, orientation) {
  const orient = normalizeOrientation(orientation);
  if (orient === 'portrait' && width > height) {
    return { width: height, height: width };
  }
  if (orient === 'landscape' && height > width) {
    return { width: height, height: width };
  }
  return { width, height };
}

function defaultWorldPerInch(units = 'ft') {
  return DEFAULT_WORLD_PER_INCH[units] || DEFAULT_WORLD_PER_INCH.ft;
}

function worldSizeFromSheet(sheetKey, units = 'ft', worldPerInch) {
  const key = normalizeSheetKey(sheetKey);
  if (!key) return null;
  const sheet = ARCH_SHEETS[key];
  const wpi = Number.isFinite(+worldPerInch) && +worldPerInch > 0
    ? +worldPerInch
    : defaultWorldPerInch(units);
  return {
    sheetKey: key,
    label: sheet.label,
    width: sheet.widthIn * wpi,
    height: sheet.heightIn * wpi,
    worldPerInch: wpi,
    widthIn: sheet.widthIn,
    heightIn: sheet.heightIn,
  };
}

function extentsFromSheet(sheetKey, centerX, centerY, options = {}) {
  const units = options.units === 'm' ? 'm' : 'ft';
  const size = worldSizeFromSheet(sheetKey, units, options.worldPerInch);
  if (!size) return null;
  const cx = Number.isFinite(+centerX) ? +centerX : 0;
  const cy = Number.isFinite(+centerY) ? +centerY : 0;
  return {
    minX: cx - size.width / 2,
    minY: cy - size.height / 2,
    maxX: cx + size.width / 2,
    maxY: cy + size.height / 2,
    label: `${size.label} workspace`,
    sheetSize: size.sheetKey,
    worldPerInch: size.worldPerInch,
  };
}

/** PDFKit portrait-base dimensions ([narrow, tall] in points) for a sheet. */
function pdfPortraitBasePoints(sheetKey) {
  const key = normalizeSheetKey(sheetKey);
  if (!key) return null;
  const sheet = ARCH_SHEETS[key];
  const PT = 72;
  const w = sheet.widthIn * PT;
  const h = sheet.heightIn * PT;
  return { width: Math.min(w, h), height: Math.max(w, h), sheetKey: key };
}

/** Actual page width/height after PDFKit layout is applied. */
function pdfPageDimensions(baseW, baseH, orientation) {
  const layout = normalizeOrientation(orientation, 'landscape');
  if (layout === 'landscape') {
    return { pageW: baseH, pageH: baseW, orientation: layout };
  }
  return { pageW: baseW, pageH: baseH, orientation: layout };
}

/** PDF page size in points (72 pt/in). Arch sheets default to landscape. */
function pdfPagePoints(sheetKey, orientation = 'landscape') {
  const base = pdfPortraitBasePoints(sheetKey);
  if (!base) return null;
  const dims = pdfPageDimensions(base.width, base.height, orientation);
  return {
    width: dims.pageW,
    height: dims.pageH,
    sheetKey: base.sheetKey,
    orientation: dims.orientation,
  };
}

function formatSheetDescription(sheetKey, units = 'ft', worldPerInch) {
  const size = worldSizeFromSheet(sheetKey, units, worldPerInch);
  if (!size) return '';
  const u = units === 'm' ? 'm' : 'ft';
  const w = size.width.toFixed(0);
  const h = size.height.toFixed(0);
  return `${size.label} (${size.widthIn}×${size.heightIn} in) → ${w}×${h} ${u}`;
}

const sheetSizesApi = {
  ARCH_SHEETS,
  SHEET_KEYS,
  normalizeSheetKey,
  normalizeOrientation,
  applyOrientation,
  pdfPortraitBasePoints,
  pdfPageDimensions,
  defaultWorldPerInch,
  worldSizeFromSheet,
  extentsFromSheet,
  pdfPagePoints,
  formatSheetDescription,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = sheetSizesApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.FacilityDrawSheetSizes = sheetSizesApi;
}

'use strict';

const OVERLAY_SYMBOLS = new Set(['valve', 'pump', 'motor', 'dot', 'text', 'box']);
const OVERLAY_KINDS = new Set(['bool', 'pilot5', 'text', 'analog']);

function clampPct(n, fallback = 50) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, v));
}

function normalizeOverlay(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const tagId = String(raw.tagId || '').trim();
  if (!tagId) return null;
  const id = String(raw.id || `ovl_${tagId}_${idx}`).trim().slice(0, 64);
  return {
    id,
    tagId,
    label: String(raw.label || tagId).trim().slice(0, 80),
    xPct: clampPct(raw.xPct, 50),
    yPct: clampPct(raw.yPct, 50),
    kind: OVERLAY_KINDS.has(String(raw.kind || '').toLowerCase())
      ? String(raw.kind).toLowerCase()
      : 'bool',
    symbol: OVERLAY_SYMBOLS.has(String(raw.symbol || '').toLowerCase())
      ? String(raw.symbol).toLowerCase()
      : 'valve',
    onColor: String(raw.onColor || '#22c55e').trim(),
    offColor: String(raw.offColor || '#ef4444').trim(),
    onLabel: String(raw.onLabel || 'ON').trim().slice(0, 24),
    offLabel: String(raw.offLabel || 'OFF').trim().slice(0, 24),
    showLabel: raw.showLabel !== false,
    min: raw.min != null ? Number(raw.min) : 0,
    max: raw.max != null ? Number(raw.max) : 100,
    snapshotOnRising: !!raw.snapshotOnRising,
    snapshotOnFalling: !!raw.snapshotOnFalling,
    widthPct: clampPct(raw.widthPct, 8),
    heightPct: clampPct(raw.heightPct, 8),
  };
}

function normalizeOverlays(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  list.forEach((item, idx) => {
    const o = normalizeOverlay(item, idx);
    if (!o) return;
    let id = o.id;
    let n = 2;
    while (seen.has(id)) {
      id = `${o.id}_${n}`;
      n += 1;
    }
    seen.add(id);
    out.push({ ...o, id });
  });
  return out;
}

function overlaysForCamera(rec) {
  return normalizeOverlays(rec?.overlays || []);
}

function collectSnapshotTriggers(cameras = []) {
  const triggers = [];
  for (const rec of cameras) {
    const cameraId = rec.cameraId;
    if (!cameraId) continue;
    for (const o of overlaysForCamera(rec)) {
      if (!o.snapshotOnRising && !o.snapshotOnFalling) continue;
      triggers.push({
        cameraId,
        overlayId: o.id,
        tagId: o.tagId,
        snapshotOnRising: o.snapshotOnRising,
        snapshotOnFalling: o.snapshotOnFalling,
      });
    }
  }
  return triggers;
}

module.exports = {
  OVERLAY_SYMBOLS,
  OVERLAY_KINDS,
  normalizeOverlay,
  normalizeOverlays,
  overlaysForCamera,
  collectSnapshotTriggers,
};

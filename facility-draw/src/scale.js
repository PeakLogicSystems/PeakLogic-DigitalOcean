'use strict';

/** Compute pixels-per-real-unit from two calibration points. */
function pixelsPerUnitFromTwoPoint(p1, p2, distanceUnits) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const pixelDist = Math.hypot(dx, dy);
  const dist = Number(distanceUnits);
  if (!Number.isFinite(pixelDist) || pixelDist <= 0) return null;
  if (!Number.isFinite(dist) || dist <= 0) return null;
  return pixelDist / dist;
}

function worldToPixel(x, y, scale, origin = [0, 0]) {
  const ppu = scale?.pixelsPerUnit;
  if (!Number.isFinite(ppu) || ppu <= 0) return [x, y];
  return [
    origin[0] + x * ppu,
    origin[1] + y * ppu,
  ];
}

function pixelToWorld(px, py, scale, origin = [0, 0]) {
  const ppu = scale?.pixelsPerUnit;
  if (!Number.isFinite(ppu) || ppu <= 0) return [px, py];
  return [
    (px - origin[0]) / ppu,
    (py - origin[1]) / ppu,
  ];
}

function formatDistance(units, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  if (units === 'm') return `${v.toFixed(2)} m`;
  return `${v.toFixed(1)} ft`;
}

module.exports = {
  pixelsPerUnitFromTwoPoint,
  worldToPixel,
  pixelToWorld,
  formatDistance,
};

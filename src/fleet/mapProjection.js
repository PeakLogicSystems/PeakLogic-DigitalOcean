'use strict';

/** Florida bounding box for Cloud Studio fleet map (percent projection). */
const FL_BOUNDS = {
  latMin: 24.52,
  latMax: 31.0,
  lngMin: -87.63,
  lngMax: -80.03,
};

function latLngToPercent(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  const x = ((ln - FL_BOUNDS.lngMin) / (FL_BOUNDS.lngMax - FL_BOUNDS.lngMin)) * 100;
  const y = ((FL_BOUNDS.latMax - la) / (FL_BOUNDS.latMax - FL_BOUNDS.latMin)) * 100;
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
}

module.exports = {
  FL_BOUNDS,
  latLngToPercent,
};

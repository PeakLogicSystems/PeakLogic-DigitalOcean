'use strict';

function applyPenValue(raw, pen) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return 0;
  return v * (Number(pen?.scale) || 1) + (Number(pen?.offset) || 0);
}

function activePens(pens) {
  return (pens || []).filter((p) => p?.tagId);
}

function summarizePen(history, pen) {
  const pts = history?.[pen.tagId] || [];
  const rawVals = [];
  const scaledVals = [];
  for (const pt of pts) {
    const v = Number(pt?.value);
    if (!Number.isFinite(v)) continue;
    rawVals.push(v);
    scaledVals.push(applyPenValue(v, pen));
  }
  const stat = (arr) => {
    if (!arr.length) return { min: null, max: null, avg: null, last: null };
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { min, max, avg, last: arr[arr.length - 1] };
  };
  const raw = stat(rawVals);
  const scaled = stat(scaledVals);
  return {
    tagId: pen.tagId,
    color: pen.color || '#2563eb',
    scale: pen.scale ?? 1,
    offset: pen.offset ?? 0,
    samples: pts.length,
    raw,
    scaled,
  };
}

function penStatistics(history, pens) {
  return activePens(pens).map((pen) => summarizePen(history, pen));
}

module.exports = {
  applyPenValue,
  activePens,
  penStatistics,
};

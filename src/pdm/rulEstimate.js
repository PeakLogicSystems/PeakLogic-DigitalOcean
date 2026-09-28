'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumXX += xs[i] * xs[i];
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * Estimate RUL from aligned PdM feature windows using healthIndex trend.
 */
function estimateRulFromFeatures(features, { failureThreshold = 0.3 } = {}) {
  const points = (features || [])
    .filter((f) => f.healthIndex != null && Number.isFinite(f.healthIndex))
    .map((f) => ({
      t: f.windowStartMs ?? Date.parse(f.at),
      h: f.healthIndex,
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  if (points.length < 3) {
    return { ok: false, error: 'Need at least 3 windows with healthIndex' };
  }

  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / DAY_MS);
  const ys = points.map((p) => p.h);
  const { slope, intercept } = linearRegression(xs, ys);
  const currentHealth = ys[ys.length - 1];
  const degradationRatePerDay = Math.round(slope * 1000000) / 1000000;

  let rulDaysEstimate = null;
  if (slope < -0.00001 && currentHealth > failureThreshold) {
    rulDaysEstimate = Math.max(0, Math.round((failureThreshold - currentHealth) / slope));
  } else if (currentHealth <= failureThreshold) {
    rulDaysEstimate = 0;
  }

  let trend = 'stable';
  if (slope < -0.001) trend = 'degrading';
  else if (slope > 0.001) trend = 'improving';

  return {
    ok: true,
    currentHealth: Math.round(currentHealth * 1000) / 1000,
    degradationRatePerDay,
    rulDaysEstimate,
    failureThreshold,
    sampleCount: points.length,
    trend,
    from: new Date(points[0].t).toISOString(),
    to: new Date(points[points.length - 1].t).toISOString(),
  };
}

function featuresToChartHistory(features, { includeEdgeScore = true } = {}) {
  const health = [];
  const edgeScore = [];
  const scadaByTag = new Map();

  for (const f of features || []) {
    const ts = f.windowStartMs ?? Date.parse(f.at);
    if (!Number.isFinite(ts)) continue;
    if (f.healthIndex != null) health.push({ ts, value: f.healthIndex });
    if (includeEdgeScore && f.edge?.maxScore != null) {
      edgeScore.push({ ts, value: f.edge.maxScore });
    }
    const tagStats = f.scada?.tagStats || {};
    for (const [tagId, stats] of Object.entries(tagStats)) {
      if (stats.avg == null) continue;
      if (!scadaByTag.has(tagId)) scadaByTag.set(tagId, []);
      scadaByTag.get(tagId).push({ ts, value: stats.avg });
    }
  }

  const history = { HEALTH_IDX: health };
  if (edgeScore.length) history.EDGE_SCORE = edgeScore;
  for (const [tagId, pts] of scadaByTag) history[tagId] = pts;
  return history;
}

function defaultPdmChartPens(history) {
  const pens = [
    {
      tagId: 'HEALTH_IDX',
      color: '#16a34a',
      scale: 1,
      offset: 0,
      ymin: 0,
      ymax: 1,
      autoScale: false,
    },
  ];
  if (history.EDGE_SCORE?.length) {
    pens.push({
      tagId: 'EDGE_SCORE',
      color: '#dc2626',
      scale: 1,
      offset: 0,
      ymin: 0,
      ymax: 1,
      autoScale: false,
    });
  }
  const scadaTags = Object.keys(history).filter((k) => !['HEALTH_IDX', 'EDGE_SCORE'].includes(k));
  const colors = ['#2563eb', '#ea580c', '#9333ea', '#0891b2', '#ca8a04'];
  scadaTags.slice(0, 4).forEach((tagId, i) => {
    pens.push({
      tagId,
      color: colors[i % colors.length],
      scale: 1,
      offset: 0,
      ymin: 0,
      ymax: 100,
      autoScale: true,
    });
  });
  return pens;
}

module.exports = {
  DAY_MS,
  linearRegression,
  estimateRulFromFeatures,
  featuresToChartHistory,
  defaultPdmChartPens,
};

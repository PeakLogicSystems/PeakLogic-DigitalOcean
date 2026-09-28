'use strict';

const MIN_WINDOW_MS = 60 * 1000;
const MAX_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

function normalizeWindowMs(windowMin) {
  const ms = Math.max(Number(windowMin) || DEFAULT_WINDOW_MS / 60000, 1) * 60 * 1000;
  return Math.min(Math.max(ms, MIN_WINDOW_MS), MAX_WINDOW_MS);
}

function docTimestampMs(doc) {
  const at = doc.at;
  if (at instanceof Date) return at.getTime();
  const ts = Date.parse(at);
  return Number.isFinite(ts) ? ts : NaN;
}

function numericStats(values) {
  if (!values.length) return { count: 0, avg: null, min: null, max: null };
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    count: values.length,
    avg: Math.round((sum / values.length) * 10000) / 10000,
    min,
    max,
  };
}

function buildWindows(fromMs, toMs, windowMs) {
  const windows = [];
  for (let start = fromMs; start < toMs; start += windowMs) {
    windows.push({ start, end: Math.min(start + windowMs, toMs) });
  }
  return windows;
}

function scadaStatsForWindow(penDocs, windowStart, windowEnd) {
  const buckets = new Map();
  let sampleCount = 0;
  for (const doc of penDocs) {
    const ts = docTimestampMs(doc);
    if (!Number.isFinite(ts) || ts < windowStart || ts >= windowEnd) continue;
    const tagId = doc.pen?.tagId || doc.tag?.id;
    if (!tagId) continue;
    const value = doc.sampleValue != null ? Number(doc.sampleValue) : Number(doc.scaledValue);
    if (!Number.isFinite(value)) continue;
    if (!buckets.has(tagId)) buckets.set(tagId, []);
    buckets.get(tagId).push(value);
    sampleCount++;
  }
  const tagStats = {};
  for (const [tagId, values] of buckets) {
    tagStats[tagId] = numericStats(values);
  }
  return { tagStats, sampleCount };
}

function edgeStatsForWindow(edgeDocs, windowStart, windowEnd) {
  const scores = [];
  const labels = new Set();
  const models = new Set();
  let inferenceCount = 0;
  for (const doc of edgeDocs) {
    const ts = docTimestampMs(doc);
    if (!Number.isFinite(ts) || ts < windowStart || ts >= windowEnd) continue;
    inferenceCount++;
    const score = doc.inference?.score;
    if (Number.isFinite(score)) scores.push(score);
    if (doc.inference?.label) labels.add(doc.inference.label);
    if (doc.modelId) models.add(doc.modelId);
  }
  const scoreStats = numericStats(scores);
  return {
    inferenceCount,
    maxScore: scoreStats.max,
    avgScore: scoreStats.avg,
    labels: [...labels],
    models: [...models],
  };
}

function healthIndexFromEdge(edge) {
  if (edge.maxScore == null || !Number.isFinite(edge.maxScore)) return null;
  return Math.round((1 - Math.min(Math.max(edge.maxScore, 0), 1)) * 1000) / 1000;
}

/**
 * Align SCADA pen_sample docs and edge_inference docs into time windows per asset.
 */
function alignPdmFeatures({
  fromMs,
  toMs,
  assetId,
  windowMin,
  penDocs = [],
  edgeDocs = [],
}) {
  const winMs = normalizeWindowMs(windowMin);
  const windows = buildWindows(fromMs, toMs, winMs);
  const features = windows.map(({ start, end }) => {
    const scada = scadaStatsForWindow(penDocs, start, end);
    const edge = edgeStatsForWindow(edgeDocs, start, end);
    return {
      at: new Date(start).toISOString(),
      windowStartMs: start,
      windowEndMs: end,
      windowMin: winMs / 60000,
      assetId,
      scada,
      edge,
      healthIndex: healthIndexFromEdge(edge),
    };
  });
  return {
    features,
    meta: {
      assetId,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      windowMin: winMs / 60000,
      windowCount: features.length,
      scadaDocs: penDocs.length,
      edgeDocs: edgeDocs.length,
    },
  };
}

function resolveTagIdsForAsset(assetId, { tagIds, assetTags } = {}) {
  if (tagIds?.length) return tagIds;
  const map = assetTags && typeof assetTags === 'object' ? assetTags : {};
  const mapped = map[assetId];
  return Array.isArray(mapped) ? mapped.map(String) : [];
}

module.exports = {
  MIN_WINDOW_MS,
  MAX_WINDOW_MS,
  DEFAULT_WINDOW_MS,
  normalizeWindowMs,
  alignPdmFeatures,
  resolveTagIdsForAsset,
  scadaStatsForWindow,
  edgeStatsForWindow,
  healthIndexFromEdge,
};

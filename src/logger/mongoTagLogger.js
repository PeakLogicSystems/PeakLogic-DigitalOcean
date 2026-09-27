'use strict';

const { numericTagValue } = require('../tags/graphableTags');

const { defaultColor } = require('../graph/graphPens');
const { DEFAULT_MONGO_LOGGER } = require('../settings/mongoLoggerSettings');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HISTORIAN_MIN_CHUNK_MS = HOUR_MS;
const HISTORIAN_MAX_CHUNK_MS = 30 * DAY_MS;
const DEFAULT_LIMIT_PER_TAG = 5000;
const SEED_BATCH_SIZE = 2000;
const SEED_DEFAULT_DAYS = 90;
const SEED_DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

const SEED_DIGITAL_IDS = ['SEED_DI1', 'SEED_DI2', 'SEED_DI3', 'SEED_DI4'];
const SEED_ANALOG_IDS = ['SEED_AI1', 'SEED_AI2', 'SEED_AI3', 'SEED_AI4', 'SEED_AI5', 'SEED_AI6'];
const SEED_ALL_TAG_IDS = [...SEED_DIGITAL_IDS, ...SEED_ANALOG_IDS];

let client = null;
let collection = null;
let connecting = null;
let lastSampleLog = 0;

let override = null;

function sampleIntervalMs() {
  return Number(override?.sampleIntervalMs)
    || Number(process.env.MONGODB_SAMPLE_MS)
    || DEFAULT_MONGO_LOGGER.sampleIntervalMs;
}

function uri() {
  return override?.uri || process.env.MONGODB_URI || process.env.MONGO_URL || '';
}

function dbName() {
  return override?.db || process.env.MONGODB_DB || DEFAULT_MONGO_LOGGER.db;
}

function collectionName() {
  return override?.collection || process.env.MONGODB_COLLECTION || DEFAULT_MONGO_LOGGER.collection;
}

function tagSnapshot(tag) {
  if (!tag) return null;
  return {
    id: tag.id,
    type: tag.type,
    role: tag.role,
    driverId: tag.driverId ?? null,
    driverAddress: tag.driverAddress ?? null,
    value: tag.value,
    quality: tag.quality,
    wordWidth: tag.wordWidth,
    scale: tag.scale,
    offset: tag.offset,
  };
}

function validateTimeRange(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { ok: false, error: 'Invalid from/to timestamps' };
  }
  if (toMs <= fromMs) {
    return { ok: false, error: 'End time must be after start time' };
  }
  const spanMs = toMs - fromMs;
  if (spanMs < HISTORIAN_MIN_CHUNK_MS) {
    return { ok: false, error: 'Time range must be at least 1 hour' };
  }
  if (spanMs > HISTORIAN_MAX_CHUNK_MS) {
    return { ok: false, error: 'Time range cannot exceed 30 days' };
  }
  return { ok: true, spanMs };
}

function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return { points, downsampled: false };
  const step = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return { points: out, downsampled: true };
}

function sampleValueFromDoc(doc) {
  if (doc.sampleValue != null && Number.isFinite(Number(doc.sampleValue))) {
    return Number(doc.sampleValue);
  }
  const raw = doc.tag?.value;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function docsToHistory(docs, tagIds, limitPerTag = DEFAULT_LIMIT_PER_TAG) {
  const idSet = tagIds?.length ? new Set(tagIds) : null;
  const buckets = new Map();
  for (const doc of docs) {
    const tagId = doc.pen?.tagId || doc.tag?.id;
    if (!tagId) continue;
    if (idSet && !idSet.has(tagId)) continue;
    const ts = doc.at instanceof Date ? doc.at.getTime() : new Date(doc.at).getTime();
    if (!Number.isFinite(ts)) continue;
    if (!buckets.has(tagId)) buckets.set(tagId, []);
    buckets.get(tagId).push({
      ts,
      value: sampleValueFromDoc(doc),
      wordWidth: doc.tag?.wordWidth || 16,
    });
  }
  const history = {};
  const counts = {};
  let downsampled = false;
  for (const [tagId, points] of buckets) {
    points.sort((a, b) => a.ts - b.ts);
    const { points: trimmed, downsampled: ds } = downsample(points, limitPerTag);
    if (ds) downsampled = true;
    history[tagId] = trimmed;
    counts[tagId] = trimmed.length;
  }
  if (tagIds?.length) {
    for (const id of tagIds) {
      if (!history[id]) history[id] = [];
      if (counts[id] == null) counts[id] = 0;
    }
  }
  return { history, counts, downsampled };
}

async function connect() {
  if (collection) return true;
  const u = uri();
  if (!u) return false;
  if (connecting) return connecting;
  connecting = (async () => {
    try {
      const { MongoClient } = require('mongodb');
      client = new MongoClient(u);
      await client.connect();
      collection = client.db(dbName()).collection(collectionName());
      await collection.createIndex({ at: -1 });
      await collection.createIndex({ event: 1, 'tag.id': 1 });
      await collection.createIndex({ event: 1, at: -1, 'pen.tagId': 1 });
      console.log(`[PeakLogic] MongoDB logger connected: ${dbName()}.${collectionName()}`);
      return true;
    } catch (e) {
      console.warn('[PeakLogic] MongoDB logger:', e.message);
      client = null;
      collection = null;
      return false;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

function enabled() {
  return !!uri();
}

function status() {
  return {
    enabled: enabled(),
    connected: !!collection,
    db: dbName(),
    collection: collectionName(),
    sampleIntervalMs: sampleIntervalMs(),
    minChunkMs: HISTORIAN_MIN_CHUNK_MS,
    maxChunkMs: HISTORIAN_MAX_CHUNK_MS,
  };
}

async function insertOne(doc) {
  if (!(await connect())) return false;
  try {
    await collection.insertOne({ ...doc, at: doc.at || new Date() });
    return true;
  } catch (e) {
    console.warn('[PeakLogic] MongoDB insert:', e.message);
    return false;
  }
}

async function insertMany(docs) {
  if (!docs.length) return false;
  if (!(await connect())) return false;
  try {
    await collection.insertMany(
      docs.map((d) => ({ ...d, at: d.at || new Date() })),
      { ordered: false }
    );
    return true;
  } catch (e) {
    console.warn('[PeakLogic] MongoDB insertMany:', e.message);
    return false;
  }
}

/**
 * Log graph pen selection with full tag database rows.
 */
async function logPenSelection({ pens, tags, projectName, source }) {
  if (!enabled() || !pens?.length) return { ok: false, skipped: true };
  const tagMap = new Map((tags || []).map((t) => [t.id, t]));
  const docs = pens.map((pen) => ({
    event: 'pen_selection',
    source: source || 'graph_setup',
    projectName: projectName || 'untitled',
    pen,
    tag: tagSnapshot(tagMap.get(pen.tagId)),
  }));
  const ok = await insertMany(docs);
  return { ok, count: docs.length };
}

/**
 * Periodic sample of configured pen tags while runtime runs.
 */
async function logPenSamples({ pens, tags, runtime }) {
  if (!enabled() || !pens?.length) return { ok: false, skipped: true };
  const now = Date.now();
  if (now - lastSampleLog < sampleIntervalMs()) return { ok: false, skipped: true };
  lastSampleLog = now;

  const tagMap = new Map((tags || []).map((t) => [t.id, t]));
  const at = new Date(now);
  const docs = pens.map((pen) => {
    const tag = tagMap.get(pen.tagId);
    const sampleValue = tag ? numericTagValue(tag) : null;
    return {
      event: 'pen_sample',
      at,
      projectName: runtime?.projectName,
      running: !!runtime?.running,
      pen,
      tag: tagSnapshot(tag),
      sampleValue,
      scaledValue: sampleValue != null
        ? (sampleValue * (pen.scale || 1) + (pen.offset || 0))
        : null,
    };
  });
  const ok = await insertMany(docs);
  return { ok, count: docs.length };
}

/**
 * Retrieve pen_sample documents for historian graph/report (1 hour – 30 day window).
 */
async function queryPenHistory({ from, to, tagIds, projectName, limitPerTag }) {
  if (!enabled()) return { ok: false, error: 'MongoDB logger not configured' };
  const fromMs = typeof from === 'number' ? from : Date.parse(from);
  const toMs = typeof to === 'number' ? to : Date.parse(to);
  const vr = validateTimeRange(fromMs, toMs);
  if (!vr.ok) return { ok: false, error: vr.error };
  if (!(await connect())) return { ok: false, error: 'MongoDB not connected' };

  const lim = Math.min(Math.max(Number(limitPerTag) || DEFAULT_LIMIT_PER_TAG, 100), 20000);
  const filter = {
    event: 'pen_sample',
    at: { $gte: new Date(fromMs), $lte: new Date(toMs) },
  };
  if (tagIds?.length) filter['pen.tagId'] = { $in: tagIds };
  if (projectName) filter.projectName = projectName;

  try {
    const docs = await collection.find(filter).sort({ at: 1 }).toArray();
    const { history, counts, downsampled } = docsToHistory(docs, tagIds, lim);
    return {
      ok: true,
      history,
      meta: {
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString(),
        spanMs: vr.spanMs,
        tagIds: tagIds?.length ? tagIds : Object.keys(history),
        counts,
        totalDocs: docs.length,
        downsampled,
        source: 'mongo',
      },
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function seededRandom(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483646 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

function buildSeedTagDefinitions() {
  const digital = SEED_DIGITAL_IDS.map((id) => ({
    id,
    type: 'BOOL',
    role: 'input',
    value: false,
    graphEnabled: true,
    quality: 'good',
  }));
  const analog = SEED_ANALOG_IDS.map((id) => ({
    id,
    type: 'REAL',
    role: 'input',
    value: 0,
    graphEnabled: true,
    wordWidth: 16,
    quality: 'good',
  }));
  return [...digital, ...analog];
}

function buildSeedPens() {
  return SEED_ALL_TAG_IDS.map((tagId, i) => ({
    tagId,
    color: defaultColor(i),
    scale: 1,
    offset: 0,
    ymin: tagId.startsWith('SEED_DI') ? 0 : 0,
    ymax: tagId.startsWith('SEED_DI') ? 1 : 100,
    autoScale: true,
  }));
}

/**
 * Build pen_sample documents for demo historian data (pure, for tests and seeding).
 */
function generateSeedSampleDocs({
  days = SEED_DEFAULT_DAYS,
  intervalMs = SEED_DEFAULT_INTERVAL_MS,
  projectName = 'seed_demo',
  now = Date.now(),
}) {
  const dayCount = Math.min(Math.max(Number(days) || SEED_DEFAULT_DAYS, 1), 90);
  const stepMs = Math.max(Number(intervalMs) || SEED_DEFAULT_INTERVAL_MS, 60 * 1000);
  const endMs = now;
  const startMs = endMs - dayCount * DAY_MS;
  const pens = buildSeedPens();
  const penByTag = new Map(pens.map((p) => [p.tagId, p]));
  const docs = [];
  let tick = 0;
  for (let t = startMs; t <= endMs; t += stepMs) {
    const at = new Date(t);
    for (let tagIdx = 0; tagIdx < SEED_ALL_TAG_IDS.length; tagIdx++) {
      const tagId = SEED_ALL_TAG_IDS[tagIdx];
      const pen = penByTag.get(tagId);
      const isDigital = tagId.startsWith('SEED_DI');
      const rnd = seededRandom(tagIdx * 9973 + tick);
      let sampleValue;
      if (isDigital) {
        sampleValue = rnd() > 0.52 ? 1 : 0;
      } else {
        const hours = (t - startMs) / HOUR_MS;
        const analogIdx = tagIdx - SEED_DIGITAL_IDS.length;
        const base = 40 + analogIdx * 8
          + 25 * Math.sin((hours / 24) * Math.PI * 2 + analogIdx * 0.7);
        sampleValue = Math.round((base + (rnd() - 0.5) * 6) * 100) / 100;
      }
      const tag = {
        id: tagId,
        type: isDigital ? 'BOOL' : 'REAL',
        role: 'input',
        value: isDigital ? sampleValue === 1 : sampleValue,
        wordWidth: 16,
        quality: 'good',
      };
      docs.push({
        event: 'pen_sample',
        at,
        projectName,
        running: false,
        source: 'seed',
        pen,
        tag: tagSnapshot(tag),
        sampleValue,
        scaledValue: sampleValue * (pen.scale || 1) + (pen.offset || 0),
      });
    }
    tick++;
  }
  return {
    docs,
    startMs,
    endMs,
    dayCount,
    intervalMs: stepMs,
    tags: SEED_ALL_TAG_IDS,
    pens,
    sampleCount: docs.length,
  };
}

async function purgeHistory({ from, to, tagIds, projectName, events, all }) {
  if (!enabled()) return { ok: false, error: 'MongoDB logger not configured' };
  if (!(await connect())) return { ok: false, error: 'MongoDB not connected' };

  const filter = {};
  if (!all) {
    const fromMs = typeof from === 'number' ? from : Date.parse(from);
    const toMs = typeof to === 'number' ? to : Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      return { ok: false, error: 'Invalid from/to timestamps' };
    }
    if (toMs <= fromMs) return { ok: false, error: 'End time must be after start time' };
    filter.at = { $gte: new Date(fromMs), $lte: new Date(toMs) };
  }
  const evts = events?.length ? events : ['pen_sample', 'pen_selection'];
  filter.event = evts.length === 1 ? evts[0] : { $in: evts };
  if (tagIds?.length) filter['pen.tagId'] = { $in: tagIds };
  if (projectName) filter.projectName = projectName;

  try {
    const result = await collection.deleteMany(filter);
    return { ok: true, deletedCount: result.deletedCount };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function seedDemoHistory({
  days = SEED_DEFAULT_DAYS,
  intervalMs = SEED_DEFAULT_INTERVAL_MS,
  projectName = 'seed_demo',
}) {
  if (!enabled()) return { ok: false, error: 'MongoDB logger not configured' };
  if (!(await connect())) return { ok: false, error: 'MongoDB not connected' };

  const generated = generateSeedSampleDocs({ days, intervalMs, projectName });
  let inserted = 0;
  try {
    for (let i = 0; i < generated.docs.length; i += SEED_BATCH_SIZE) {
      const batch = generated.docs.slice(i, i + SEED_BATCH_SIZE);
      await collection.insertMany(batch, { ordered: false });
      inserted += batch.length;
    }
    return {
      ok: true,
      inserted,
      projectName,
      tags: generated.tags,
      pens: generated.pens,
      tagDefinitions: buildSeedTagDefinitions(),
      from: new Date(generated.startMs).toISOString(),
      to: new Date(generated.endMs).toISOString(),
      days: generated.dayCount,
      intervalMs: generated.intervalMs,
      digitalCount: SEED_DIGITAL_IDS.length,
      analogCount: SEED_ANALOG_IDS.length,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), inserted };
  }
}

async function close() {
  if (client) {
    try { await client.close(); } catch { /* ignore */ }
  }
  client = null;
  collection = null;
}

module.exports = {
  HISTORIAN_MIN_CHUNK_MS,
  HISTORIAN_MAX_CHUNK_MS,
  SEED_DIGITAL_IDS,
  SEED_ANALOG_IDS,
  SEED_ALL_TAG_IDS,
  validateTimeRange,
  docsToHistory,
  buildSeedTagDefinitions,
  buildSeedPens,
  generateSeedSampleDocs,
  setConfig: async (cfg) => {
    override = cfg && typeof cfg === 'object' ? { ...cfg } : null;
    await close();
  },
  clearConfig: async () => {
    override = null;
    await close();
  },
  enabled,
  status,
  connect,
  logPenSelection,
  logPenSamples,
  queryPenHistory,
  purgeHistory,
  seedDemoHistory,
  close,
};

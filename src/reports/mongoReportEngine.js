'use strict';

const mongoSysLog = require('../logger/mongoSysLog');
const mongoTagLogger = require('../logger/mongoTagLogger');
const hardwareHistoryStore = require('../hardware/hardwareHistoryStore');
const persistence = require('../persistence');
const { TENANT_ID } = require('../config');
const { computeRoiSummary, normalizeRoiSettings } = require('../settings/roiSettings');
const { round2 } = require('../settings/roiCalculator');
const cmmsStore = require('../cmms/cmmsStore');
const { getSource } = require('./mongoReportCatalog');
const { normalizeReportSpec } = require('./mongoReportDefs');

const ALLOWED_COLLECTIONS = new Set([
  'sys_log',
  'tag_samples_ts',
  'tag_logs',
  'hardware_assignments',
  'edge_inference_ts',
  'pdm_features',
  'camera_events',
]);

function getNested(obj, path) {
  if (!path) return obj;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[p];
  }
  return cur;
}

function formatCell(val) {
  if (val == null) return '';
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function flattenSampleDoc(doc) {
  const tagId = doc.metadata?.tagId || doc.pen?.tagId || doc.tag?.id || '';
  const timestamp = doc.timestamp || doc.at || null;
  return {
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp || ''),
    tagId,
    tagType: doc.metadata?.tagType || doc.tag?.type || '',
    value: doc.value ?? doc.sampleValue ?? null,
    scaledValue: doc.scaledValue ?? null,
    running: doc.running ?? null,
    projectName: doc.metadata?.projectName || doc.projectName || '',
    source: doc.metadata?.source || doc.source || '',
  };
}

function flattenGenericDoc(doc, prefix = '', depth = 0) {
  if (!doc || typeof doc !== 'object' || depth > 2) return {};
  const out = {};
  for (const [key, val] of Object.entries(doc)) {
    if (key === '_id') {
      out.id = formatCell(val);
      continue;
    }
    const path = prefix ? `${prefix}.${key}` : key;
    if (val != null && typeof val === 'object' && !(val instanceof Date) && !Array.isArray(val) && depth < 2) {
      Object.assign(out, flattenGenericDoc(val, path, depth + 1));
    } else {
      out[path] = formatCell(val);
    }
  }
  return out;
}

function sortRows(rows, field, dir) {
  const mult = dir === 1 ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getNested(a, field);
    const bv = getNested(b, field);
    const aMs = Date.parse(av);
    const bMs = Date.parse(bv);
    if (Number.isFinite(aMs) && Number.isFinite(bMs)) return (aMs - bMs) * mult;
    return String(av ?? '').localeCompare(String(bv ?? '')) * mult;
  });
}

function projectRows(rows, columns) {
  return rows.map((row) => {
    const out = {};
    for (const col of columns) {
      out[col] = formatCell(getNested(row, col));
    }
    return out;
  });
}

async function querySysLog(spec) {
  const filter = { tenantId: mongoSysLog.status().tenantId || TENANT_ID };
  if (spec.filter?.level) filter.level = String(spec.filter.level);
  if (spec.filter?.category) filter.category = String(spec.filter.category);
  return mongoSysLog.query(filter, {
    limit: spec.limit,
    since: spec.since,
    until: spec.until,
    userId: spec.filter?.userId,
  });
}

async function queryHardware(spec) {
  let rows;
  const positionId = String(spec.filter?.positionId || '').trim();
  const serial = String(spec.filter?.serialNumber || '').trim();
  if (positionId) {
    rows = await hardwareHistoryStore.listByPosition(positionId, { limit: spec.limit });
  } else if (serial) {
    rows = await hardwareHistoryStore.listBySerial(serial, { limit: spec.limit });
  } else {
    rows = await hardwareHistoryStore.listRecent({ limit: spec.limit });
  }
  if (spec.since) {
    const sinceMs = Date.parse(spec.since);
    if (Number.isFinite(sinceMs)) {
      rows = rows.filter((r) => Date.parse(r.installedAt) >= sinceMs);
    }
  }
  if (spec.until) {
    const untilMs = Date.parse(spec.until);
    if (Number.isFinite(untilMs)) {
      rows = rows.filter((r) => Date.parse(r.installedAt) <= untilMs);
    }
  }
  return rows;
}

async function queryTagSamples(spec) {
  const db = await mongoTagLogger.getDb();
  if (!db) return { error: 'MongoDB tag historian not connected — configure Logger config and connect MongoDB' };
  const st = mongoTagLogger.status();
  const samplesCol = db.collection(st.samplesCollection || 'tag_samples_ts');
  const legacyCol = db.collection(st.collection || 'tag_logs');
  const q = {};
  if (spec.since || spec.until) {
    q.timestamp = {};
    if (spec.since) q.timestamp.$gte = new Date(spec.since);
    if (spec.until) q.timestamp.$lte = new Date(spec.until);
  }
  if (spec.filter?.tagId) q['metadata.tagId'] = String(spec.filter.tagId);
  if (spec.filter?.projectName) q['metadata.projectName'] = String(spec.filter.projectName);
  const [tsDocs, legacyDocs] = await Promise.all([
    samplesCol.find(q).sort({ timestamp: spec.sortDir === 1 ? 1 : -1 }).limit(spec.limit).toArray(),
    legacyCol.find(buildLegacySampleQuery(spec)).sort({ at: spec.sortDir === 1 ? 1 : -1 }).limit(spec.limit).toArray(),
  ]);
  return [...legacyDocs, ...tsDocs].map(flattenSampleDoc);
}

function buildLegacySampleQuery(spec) {
  const q = { type: 'pen_sample' };
  if (spec.since || spec.until) {
    q.at = {};
    if (spec.since) q.at.$gte = new Date(spec.since);
    if (spec.until) q.at.$lte = new Date(spec.until);
  }
  if (spec.filter?.tagId) q['pen.tagId'] = String(spec.filter.tagId);
  if (spec.filter?.projectName) q.projectName = String(spec.filter.projectName);
  return q;
}

async function queryCollection(spec) {
  const name = String(spec.collection || '').trim();
  if (!ALLOWED_COLLECTIONS.has(name)) {
    return { error: `Collection not allowed: ${name || '(none)'}` };
  }
  const db = await mongoTagLogger.getDb();
  if (!db) return { error: 'MongoDB not connected — configure MongoDB URI under Logger config' };
  const col = db.collection(name);
  const q = {};
  const dateField = spec.sortField || 'at';
  if (spec.since || spec.until) {
    q[dateField] = {};
    if (spec.since) q[dateField].$gte = new Date(spec.since);
    if (spec.until) q[dateField].$lte = new Date(spec.until);
  }
  const docs = await col.find(q).sort({ [dateField]: spec.sortDir === 1 ? 1 : -1 }).limit(spec.limit).toArray();
  return docs.map((doc) => flattenGenericDoc(doc));
}

function queryRoiSummary() {
  const settings = persistence.readJson('settings.json', {});
  const roi = normalizeRoiSettings(settings.roi, settings);
  const summary = computeRoiSummary(roi);
  const leak = summary.leakDetection;
  const pool = summary.pool;
  const combined = summary.combined;
  const combinedAmortized = leak.amortizedAnnualCost + pool.amortizedAnnualCost;
  const combinedPaybackMonths = combined.annualGrossSavings > 0
    ? round2((combined.upfrontCost / combined.annualGrossSavings) * 12)
    : null;
  const combinedLifeYears = Math.max(leak.amortizationYears, pool.amortizationYears);
  const combinedTotalSavings = combined.annualGrossSavings * combinedLifeYears;
  const combinedRoiPercent = combined.upfrontCost > 0
    ? round2(((combinedTotalSavings - combined.upfrontCost) / combined.upfrontCost) * 100)
    : (combinedTotalSavings > 0 ? 100 : 0);

  return [
    {
      asset: 'Leak detection',
      upfrontCost: leak.systemCost,
      annualGrossSavings: leak.annualGrossSavings,
      amortizedAnnualCost: leak.amortizedAnnualCost,
      netAnnualBenefit: leak.netAnnualBenefit,
      paybackMonths: leak.paybackMonths,
      roiPercent: leak.roiPercent,
    },
    {
      asset: 'Pool (pump & chemistry)',
      upfrontCost: pool.totalUpfrontCost,
      annualGrossSavings: pool.annualGrossSavings,
      amortizedAnnualCost: pool.amortizedAnnualCost,
      netAnnualBenefit: pool.netAnnualBenefit,
      paybackMonths: pool.paybackMonths,
      roiPercent: pool.roiPercent,
    },
    {
      asset: 'Combined',
      upfrontCost: combined.upfrontCost,
      annualGrossSavings: combined.annualGrossSavings,
      amortizedAnnualCost: round2(combinedAmortized),
      netAnnualBenefit: combined.netAnnualBenefit,
      paybackMonths: combinedPaybackMonths,
      roiPercent: combinedRoiPercent,
    },
  ];
}

async function discoverCollectionFields(collectionName) {
  const name = String(collectionName || '').trim();
  if (!ALLOWED_COLLECTIONS.has(name)) return { error: `Collection not allowed: ${name}` };
  const db = await mongoTagLogger.getDb();
  if (!db) return { error: 'MongoDB not connected' };
  const doc = await db.collection(name).findOne({});
  if (!doc) return { fields: [] };
  const flat = flattenGenericDoc(doc);
  return {
    fields: Object.keys(flat).sort().map((id) => ({ id, label: id, type: 'string' })),
  };
}

async function runMongoReport(rawSpec) {
  const spec = normalizeReportSpec(rawSpec);
  const source = getSource(spec.sourceId);
  if (!source) return { ok: false, error: `Unknown source: ${spec.sourceId}` };

  let rows;
  if (spec.sourceId === 'sys_log') {
    rows = await querySysLog(spec);
  } else if (spec.sourceId === 'hardware_assignments') {
    rows = await queryHardware(spec);
  } else if (spec.sourceId === 'tag_samples') {
    const result = await queryTagSamples(spec);
    if (result?.error) return { ok: false, error: result.error };
    rows = result;
  } else if (spec.sourceId === 'collection') {
    const result = await queryCollection(spec);
    if (result?.error) return { ok: false, error: result.error };
    rows = result;
    if (!spec.columns.length && rows.length) {
      spec.columns = Object.keys(rows[0]);
    }
  } else if (spec.sourceId === 'roi_summary') {
    rows = queryRoiSummary();
  } else if (spec.sourceId === 'cmms_work_orders') {
    rows = cmmsStore.listWorkOrders(spec);
  } else if (spec.sourceId === 'cmms_pm_schedules') {
    rows = cmmsStore.listPmSchedules(spec);
  } else {
    return { ok: false, error: `Unsupported source: ${spec.sourceId}` };
  }

  const columns = spec.columns.length
    ? spec.columns
    : (source.defaultColumns.length ? source.defaultColumns : Object.keys(rows[0] || {}));
  if (spec.sourceId !== 'roi_summary') {
    rows = sortRows(rows, spec.sortField, spec.sortDir);
  }
  const projected = projectRows(rows, columns);
  const columnLabels = columns.map((id) => {
    const field = source.fields?.find((f) => f.id === id);
    return { id, label: field?.label || id };
  });

  return {
    ok: true,
    spec,
    columns: columnLabels,
    rows: projected,
    meta: {
      rowCount: projected.length,
      sourceId: spec.sourceId,
      collection: spec.collection,
    },
  };
}

module.exports = {
  ALLOWED_COLLECTIONS,
  runMongoReport,
  discoverCollectionFields,
  formatCell,
  getNested,
};

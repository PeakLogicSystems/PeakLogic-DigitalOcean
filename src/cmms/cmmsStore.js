'use strict';

const persistence = require('../persistence');

const STORE_FILE = 'cmms.json';
const WO_STATUSES = ['open', 'in_progress', 'complete', 'cancelled'];
const WO_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const WO_SOURCES = ['manual', 'alarm', 'pm', 'pdm'];

function emptyStore() {
  return { workOrders: [], pmSchedules: [], nextWoSeq: 1 };
}

function loadStore() {
  const raw = persistence.readJson(STORE_FILE, emptyStore());
  return {
    workOrders: Array.isArray(raw.workOrders) ? raw.workOrders : [],
    pmSchedules: Array.isArray(raw.pmSchedules) ? raw.pmSchedules : [],
    nextWoSeq: Number.isFinite(raw.nextWoSeq) && raw.nextWoSeq > 0 ? raw.nextWoSeq : 1,
  };
}

function saveStore(store) {
  persistence.writeJson(STORE_FILE, store);
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function parseIso(val) {
  if (!val) return null;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeStatus(v) {
  const s = String(v || 'open').toLowerCase();
  return WO_STATUSES.includes(s) ? s : 'open';
}

function normalizePriority(v) {
  const p = String(v || 'normal').toLowerCase();
  return WO_PRIORITIES.includes(p) ? p : 'normal';
}

function normalizeSource(v) {
  const s = String(v || 'manual').toLowerCase();
  return WO_SOURCES.includes(s) ? s : 'manual';
}

function formatWoNumber(seq) {
  return `WO-${String(seq).padStart(4, '0')}`;
}

function computeNextDue(lastCompletedAt, intervalDays, fallbackStart) {
  const days = Math.max(1, Number(intervalDays) || 30);
  const baseMs = Date.parse(lastCompletedAt || fallbackStart || isoNow());
  const start = Number.isFinite(baseMs) ? baseMs : Date.now();
  return new Date(start + days * 86400000).toISOString();
}

function normalizeWorkOrder(raw, existing = null) {
  const now = isoNow();
  const status = normalizeStatus(raw.status ?? existing?.status);
  return {
    id: existing?.id || raw.id || newId('wo'),
    number: existing?.number || raw.number || '',
    title: String(raw.title ?? existing?.title ?? '').trim().slice(0, 120) || 'Work order',
    description: String(raw.description ?? existing?.description ?? '').trim().slice(0, 4000),
    assetId: String(raw.assetId ?? existing?.assetId ?? '').trim().slice(0, 64),
    status,
    priority: normalizePriority(raw.priority ?? existing?.priority),
    source: normalizeSource(raw.source ?? existing?.source),
    sourceRef: String(raw.sourceRef ?? existing?.sourceRef ?? '').trim().slice(0, 120),
    assignee: String(raw.assignee ?? existing?.assignee ?? '').trim().slice(0, 80),
    createdAt: existing?.createdAt || parseIso(raw.createdAt) || now,
    updatedAt: now,
    dueAt: parseIso(raw.dueAt ?? existing?.dueAt),
    completedAt: status === 'complete'
      ? (parseIso(raw.completedAt) || existing?.completedAt || now)
      : (raw.completedAt === null ? null : (existing?.completedAt || null)),
  };
}

function normalizePmSchedule(raw, existing = null) {
  const now = isoNow();
  const intervalDays = Math.min(Math.max(Number(raw.intervalDays ?? existing?.intervalDays) || 30, 1), 3650);
  const lastCompletedAt = parseIso(raw.lastCompletedAt ?? existing?.lastCompletedAt);
  const createdAt = existing?.createdAt || parseIso(raw.createdAt) || now;
  const nextDueAt = parseIso(raw.nextDueAt)
    || computeNextDue(lastCompletedAt, intervalDays, createdAt);
  return {
    id: existing?.id || raw.id || newId('pm'),
    title: String(raw.title ?? existing?.title ?? '').trim().slice(0, 120) || 'Preventive maintenance',
    assetId: String(raw.assetId ?? existing?.assetId ?? '').trim().slice(0, 64),
    intervalDays,
    lastCompletedAt,
    nextDueAt,
    assignee: String(raw.assignee ?? existing?.assignee ?? '').trim().slice(0, 80),
    enabled: raw.enabled === false ? false : (existing?.enabled === false ? false : true),
    woTitle: String(raw.woTitle ?? existing?.woTitle ?? '').trim().slice(0, 120),
    createdAt,
    updatedAt: now,
  };
}

function enrichPmRow(pm) {
  const dueMs = Date.parse(pm.nextDueAt);
  const overdue = pm.enabled !== false && Number.isFinite(dueMs) && dueMs < Date.now();
  return {
    ...pm,
    overdue: overdue ? 'yes' : 'no',
    daysUntilDue: Number.isFinite(dueMs)
      ? Math.round((dueMs - Date.now()) / 86400000)
      : null,
  };
}

function enrichWoRow(wo) {
  const dueMs = Date.parse(wo.dueAt);
  const overdue = ['open', 'in_progress'].includes(wo.status)
    && Number.isFinite(dueMs)
    && dueMs < Date.now();
  return { ...wo, overdue: overdue ? 'yes' : 'no' };
}

function listWorkOrders(opts = {}) {
  const store = loadStore();
  let rows = store.workOrders.map(enrichWoRow);
  const statusFilter = String(opts.status || opts.filter?.status || '').trim().toLowerCase();
  if (statusFilter) {
    const allowed = statusFilter.split(',').map((s) => s.trim()).filter(Boolean);
    rows = rows.filter((r) => allowed.includes(r.status));
  }
  if (opts.filter?.priority) {
    rows = rows.filter((r) => r.priority === normalizePriority(opts.filter.priority));
  }
  if (opts.filter?.source) {
    rows = rows.filter((r) => r.source === normalizeSource(opts.filter.source));
  }
  if (opts.filter?.assetId) {
    const aid = String(opts.filter.assetId).trim();
    rows = rows.filter((r) => r.assetId === aid);
  }
  if (opts.filter?.overdue === 'yes') {
    rows = rows.filter((r) => r.overdue === 'yes');
  }
  if (opts.since) {
    const sinceMs = Date.parse(opts.since);
    if (Number.isFinite(sinceMs)) {
      rows = rows.filter((r) => Date.parse(r.createdAt) >= sinceMs);
    }
  }
  if (opts.until) {
    const untilMs = Date.parse(opts.until);
    if (Number.isFinite(untilMs)) {
      rows = rows.filter((r) => Date.parse(r.createdAt) <= untilMs);
    }
  }
  const sortField = String(opts.sortField || 'createdAt');
  const sortDir = Number(opts.sortDir) === 1 ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sortField] ?? '';
    const bv = b[sortField] ?? '';
    const aMs = Date.parse(av);
    const bMs = Date.parse(bv);
    if (Number.isFinite(aMs) && Number.isFinite(bMs)) return (aMs - bMs) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 5000);
  return rows.slice(0, limit);
}

function listPmSchedules(opts = {}) {
  const store = loadStore();
  let rows = store.pmSchedules.map(enrichPmRow);
  if (opts.filter?.enabled === 'yes') rows = rows.filter((r) => r.enabled !== false);
  if (opts.filter?.enabled === 'no') rows = rows.filter((r) => r.enabled === false);
  if (opts.filter?.overdue === 'yes') rows = rows.filter((r) => r.overdue === 'yes');
  if (opts.filter?.assetId) {
    const aid = String(opts.filter.assetId).trim();
    rows = rows.filter((r) => r.assetId === aid);
  }
  const sortField = String(opts.sortField || 'nextDueAt');
  const sortDir = Number(opts.sortDir) === 1 ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sortField] ?? '';
    const bv = b[sortField] ?? '';
    const aMs = Date.parse(av);
    const bMs = Date.parse(bv);
    if (Number.isFinite(aMs) && Number.isFinite(bMs)) return (aMs - bMs) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 5000);
  return rows.slice(0, limit);
}

function getWorkOrder(id) {
  const store = loadStore();
  const wo = store.workOrders.find((r) => r.id === id);
  return wo ? enrichWoRow(wo) : null;
}

function getPmSchedule(id) {
  const store = loadStore();
  const pm = store.pmSchedules.find((r) => r.id === id);
  return pm ? enrichPmRow(pm) : null;
}

function createWorkOrder(input = {}) {
  const store = loadStore();
  const wo = normalizeWorkOrder(input);
  if (!wo.number) {
    wo.number = formatWoNumber(store.nextWoSeq);
    store.nextWoSeq += 1;
  }
  store.workOrders.unshift(wo);
  saveStore(store);
  return enrichWoRow(wo);
}

function updateWorkOrder(id, patch = {}) {
  const store = loadStore();
  const idx = store.workOrders.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prevStatus = store.workOrders[idx].status;
  const next = normalizeWorkOrder({ ...store.workOrders[idx], ...patch }, store.workOrders[idx]);
  store.workOrders[idx] = next;
  saveStore(store);
  const enriched = enrichWoRow(next);
  if (prevStatus !== 'complete' && next.status === 'complete') {
    try {
      const { appendServiceHistoryFromWorkOrder } = require('./pdmCmmsBridge');
      appendServiceHistoryFromWorkOrder(enriched);
    } catch { /* optional bridge */ }
  }
  return enriched;
}

function deleteWorkOrder(id) {
  const store = loadStore();
  const before = store.workOrders.length;
  store.workOrders = store.workOrders.filter((r) => r.id !== id);
  if (store.workOrders.length === before) return false;
  saveStore(store);
  return true;
}

function createPmSchedule(input = {}) {
  const store = loadStore();
  const pm = normalizePmSchedule(input);
  store.pmSchedules.unshift(pm);
  saveStore(store);
  return enrichPmRow(pm);
}

function updatePmSchedule(id, patch = {}) {
  const store = loadStore();
  const idx = store.pmSchedules.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next = normalizePmSchedule({ ...store.pmSchedules[idx], ...patch }, store.pmSchedules[idx]);
  store.pmSchedules[idx] = next;
  saveStore(store);
  return enrichPmRow(next);
}

function deletePmSchedule(id) {
  const store = loadStore();
  const before = store.pmSchedules.length;
  store.pmSchedules = store.pmSchedules.filter((r) => r.id !== id);
  if (store.pmSchedules.length === before) return false;
  saveStore(store);
  return true;
}

function completeWorkOrder(id) {
  return updateWorkOrder(id, { status: 'complete', completedAt: isoNow() });
}

function completePmSchedule(id) {
  const store = loadStore();
  const idx = store.pmSchedules.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const now = isoNow();
  const prev = store.pmSchedules[idx];
  const next = normalizePmSchedule({
    ...prev,
    lastCompletedAt: now,
    nextDueAt: computeNextDue(now, prev.intervalDays, now),
  }, prev);
  store.pmSchedules[idx] = next;
  saveStore(store);
  return enrichPmRow(next);
}

function hasOpenPmWorkOrder(store, pmId) {
  return store.workOrders.some(
    (wo) => wo.source === 'pm'
      && wo.sourceRef === pmId
      && ['open', 'in_progress'].includes(wo.status),
  );
}

function generateDuePmWorkOrders() {
  const store = loadStore();
  const created = [];
  const now = isoNow();
  for (const pm of store.pmSchedules) {
    if (pm.enabled === false) continue;
    const dueMs = Date.parse(pm.nextDueAt);
    if (!Number.isFinite(dueMs) || dueMs > Date.now()) continue;
    if (hasOpenPmWorkOrder(store, pm.id)) continue;
    const wo = normalizeWorkOrder({
      title: pm.woTitle || pm.title || `PM: ${pm.title}`,
      description: `Auto-generated from PM schedule ${pm.title}`,
      assetId: pm.assetId,
      assignee: pm.assignee,
      source: 'pm',
      sourceRef: pm.id,
      dueAt: pm.nextDueAt || now,
      priority: 'normal',
      status: 'open',
    });
    wo.number = formatWoNumber(store.nextWoSeq);
    store.nextWoSeq += 1;
    store.workOrders.unshift(wo);
    created.push(enrichWoRow(wo));
  }
  if (created.length) saveStore(store);
  return { created, count: created.length };
}

function status() {
  const store = loadStore();
  const openWo = store.workOrders.filter((w) => ['open', 'in_progress'].includes(w.status)).length;
  const overduePm = store.pmSchedules.filter((p) => {
    if (p.enabled === false) return false;
    const dueMs = Date.parse(p.nextDueAt);
    return Number.isFinite(dueMs) && dueMs < Date.now();
  }).length;
  return {
    workOrderCount: store.workOrders.length,
    openWorkOrders: openWo,
    pmScheduleCount: store.pmSchedules.length,
    overduePm,
    storeFile: STORE_FILE,
  };
}

module.exports = {
  WO_STATUSES,
  WO_PRIORITIES,
  WO_SOURCES,
  listWorkOrders,
  listPmSchedules,
  getWorkOrder,
  getPmSchedule,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
  createPmSchedule,
  updatePmSchedule,
  deletePmSchedule,
  completeWorkOrder,
  completePmSchedule,
  generateDuePmWorkOrders,
  status,
};

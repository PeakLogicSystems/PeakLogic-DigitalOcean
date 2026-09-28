'use strict';

const COMPANIES = new Set(['ace', 'boyette', 'bresa', 'wtr_doctor', 'alf', 'local']);

function sanitizeSegment(value, fallback = 'unknown') {
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
}

function resolveCompany(doc) {
  const c = String(doc?.company ?? doc?.tenantId ?? process.env.PEAKLOGIC_TENANT_ID ?? 'local').trim().toLowerCase();
  return COMPANIES.has(c) ? c : sanitizeSegment(c, 'local');
}

function resolveSiteId(doc) {
  return sanitizeSegment(
    doc?.siteId ?? doc?.deviceId ?? doc?.tag?.driverId ?? doc?.projectName,
    'unknown',
  );
}

function utcDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

function archiveRelativePath({ company, siteId, dayKey, ext }) {
  const co = sanitizeSegment(company, 'local');
  const site = sanitizeSegment(siteId, 'unknown');
  const year = dayKey.slice(0, 4);
  const base = `company=${co}/site=${site}/year=${year}/day=${dayKey}`;
  if (ext === 'blob') return `${base}.jsonl.zst`;
  if (ext === 'index') return `${base}.index.json`;
  return base;
}

function partitionKey(doc) {
  return `${resolveCompany(doc)}\0${resolveSiteId(doc)}`;
}

function parsePartitionKey(key) {
  const [company, siteId] = String(key).split('\0');
  return { company, siteId };
}

function dayBoundsUtc(dayKey) {
  const periodStart = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(periodStart.getTime())) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd };
}

/** Calendar day exactly 7 UTC days before today (compact target). */
function defaultCompactDayKey(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 7);
  return utcDayKey(d);
}

module.exports = {
  COMPANIES,
  sanitizeSegment,
  resolveCompany,
  resolveSiteId,
  utcDayKey,
  archiveRelativePath,
  partitionKey,
  parsePartitionKey,
  dayBoundsUtc,
  defaultCompactDayKey,
};

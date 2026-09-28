'use strict';

const persistence = require('../persistence');

const FALLBACK_FILE = 'gateway_cellular.json';

function loadStore() {
  const raw = persistence.readJson(FALLBACK_FILE, { reports: {} });
  return raw.reports && typeof raw.reports === 'object' ? raw.reports : {};
}

function saveStore(reports) {
  persistence.writeJson(FALLBACK_FILE, { reports });
}

function normalizeReport(input = {}) {
  const now = new Date().toISOString();
  return {
    gatewayId: String(input.gatewayId || '').trim() || null,
    platform: String(input.platform || 'nanopi-neo-cat1').trim(),
    iccid: input.iccid != null ? String(input.iccid).trim() : null,
    imsi: input.imsi != null ? String(input.imsi).trim() : null,
    imei: input.imei != null ? String(input.imei).trim() : null,
    signal: Number.isFinite(Number(input.signal)) ? Number(input.signal) : null,
    reportedAt: input.reportedAt || now,
    receivedAt: now,
    autoLink: input.autoLink && typeof input.autoLink === 'object' ? { ...input.autoLink } : null,
    raw: input.raw && typeof input.raw === 'object' ? { ...input.raw } : undefined,
  };
}

function upsertReport(input) {
  const report = normalizeReport(input);
  if (!report.gatewayId) {
    throw Object.assign(new Error('gatewayId required'), { status: 400 });
  }
  const reports = loadStore();
  reports[report.gatewayId] = report;
  saveStore(reports);
  return report;
}

function listReports() {
  const reports = loadStore();
  return Object.values(reports).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
}

function getReport(gatewayId) {
  const id = String(gatewayId || '').trim();
  if (!id) return null;
  return loadStore()[id] || null;
}

module.exports = {
  upsertReport,
  listReports,
  getReport,
};

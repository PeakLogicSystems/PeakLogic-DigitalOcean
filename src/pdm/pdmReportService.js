'use strict';

const persistence = require('../persistence');
const gridfs = require('../storage/gridfsStore');
const { mirrorUpload } = require('../storage/gridfsMirror');
const { normalizeReportConfig } = require('../reports/reportConfig');
const { buildPdfReport } = require('../reports/pdfReport');
const { normalizePdmSettings } = require('../settings/pdmSettings');
const pdmService = require('./pdmService');

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultPdmReportConfig(pdm, assetId) {
  return normalizeReportConfig({
    title: pdm.reportTitle || 'PdM Report',
    subtitle: `${assetId} — proactive condition monitoring`,
    company: pdm.reportCompany || '',
    sections: {
      chart: true,
      stats: true,
      forecast: true,
      assetSetup: true,
    },
  });
}

async function buildAssetReportPdf(assetId, opts = {}) {
  const settings = opts.settings || persistence.readJson('settings.json', {});
  const pdm = normalizePdmSettings(settings.pdm, settings);
  const toMs = Number(opts.toMs) || Date.now();
  const days = Math.max(7, Number(opts.days) || pdm.simSeedDays || 180);
  const fromMs = Number(opts.fromMs) || (toMs - days * DAY_MS);
  const view = await pdmService.loadPdmView(assetId, { fromMs, toMs, settings });
  const reportConfig = normalizeReportConfig({
    ...defaultPdmReportConfig(pdm, assetId),
    ...(opts.reportConfig || {}),
  });
  const buf = await buildPdfReport({
    reportConfig,
    meta: {
      projectName: settings.project?.name || 'PdM',
      exportedAt: new Date().toISOString(),
      source: opts.source || 'PdM report',
      assetId,
    },
    pens: view.pens || [],
    history: view.history || {},
    pdm: {
      assetId,
      assetContext: view.assetContext,
      forecast: view.forecast,
      rul: view.rul,
    },
  });
  return { buf, view, reportConfig, fromMs, toMs };
}

async function storeAssetReportPdf(assetId, opts = {}) {
  const { buf, fromMs, toMs } = await buildAssetReportPdf(assetId, opts);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeAsset = String(assetId).replace(/[^\w.-]+/g, '_').slice(0, 40);
  const filename = `PeakLogic_PdM_${safeAsset}_${stamp}.pdf`;
  let gridfsFile = null;
  if (opts.storeInMongo !== false) {
    gridfsFile = await mirrorUpload(gridfs.BUCKETS.report_pdfs, buf, {
      filename,
      contentType: 'application/pdf',
      metadata: {
        type: 'pdm_report',
        assetId,
        exportedAt: new Date().toISOString(),
        fromMs,
        toMs,
      },
    });
  }
  return { filename, gridfsFile, buf };
}

async function runScheduledPdmReports(opts = {}) {
  const settings = opts.settings || persistence.readJson('settings.json', {});
  const pdm = normalizePdmSettings(settings.pdm, settings);
  if (!pdm.reportEnabled) return { ok: true, skipped: true, count: 0, reports: [] };

  const intervalMs = Math.max(1, Number(pdm.reportIntervalHours) || 168) * 3600000;
  const lastReportAt = { ...(pdm.lastReportAt || {}) };
  const assets = pdmService.listPdmAssets(pdm);
  const reports = [];
  let updated = false;

  for (const assetId of assets) {
    const lastMs = Date.parse(lastReportAt[assetId] || '');
    if (Number.isFinite(lastMs) && (Date.now() - lastMs) < intervalMs) continue;
    try {
      const stored = await storeAssetReportPdf(assetId, { settings, source: 'PdM scheduled report' });
      lastReportAt[assetId] = new Date().toISOString();
      updated = true;
      reports.push({ assetId, filename: stored.filename, fileId: stored.gridfsFile?.fileId || null });
    } catch (e) {
      reports.push({ assetId, error: e.message || String(e) });
    }
  }

  if (updated) {
    const prev = persistence.readJson('settings.json', {});
    const nextPdm = normalizePdmSettings({ ...pdm, lastReportAt }, prev);
    persistence.writeJson('settings.json', { ...prev, pdm: nextPdm });
  }

  return { ok: true, count: reports.filter((r) => r.filename).length, reports };
}

module.exports = {
  defaultPdmReportConfig,
  buildAssetReportPdf,
  storeAssetReportPdf,
  runScheduledPdmReports,
};

'use strict';

const persistence = require('../../persistence');
const { normalizeReportConfig } = require('../../reports/reportConfig');
const { buildPdfReport } = require('../../reports/pdfReport');
const { penStatistics } = require('../../reports/penStats');

function createReportRoutes() {
  const router = require('express').Router();

  router.get('/reports/config', (req, res) => {
    const settings = persistence.readJson('settings.json', {});
    res.json({ reportConfig: normalizeReportConfig(settings.reportConfig) });
  });

  router.put('/reports/config', (req, res) => {
    const prev = persistence.readJson('settings.json', {});
    const reportConfig = normalizeReportConfig(req.body?.reportConfig ?? req.body);
    const next = { ...prev, reportConfig };
    persistence.writeJson('settings.json', next);
    res.json({ ok: true, reportConfig });
  });

  router.post('/reports/pdf', async (req, res) => {
    try {
      const pens = req.body?.pens;
      const history = req.body?.history;
      if (!Array.isArray(pens) || !pens.some((p) => p?.tagId)) {
        return res.status(400).json({ error: 'At least one historian pen required' });
      }
      const stats = penStatistics(history, pens);
      if (!stats.some((s) => s.samples > 0)) {
        return res.status(400).json({ error: 'No historian samples in selected range' });
      }
      const buf = await buildPdfReport({
        reportConfig: req.body?.reportConfig,
        meta: {
          ...(req.body?.meta || {}),
          exportedAt: req.body?.meta?.exportedAt || new Date().toISOString(),
        },
        pens,
        history: history || {},
        chartImage: req.body?.chartImage || null,
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const project = (req.body?.meta?.projectName || 'report').replace(/[^\w.-]+/g, '_').slice(0, 40);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="PeakLogic_${project}_${stamp}.pdf"`);
      res.send(buf);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createReportRoutes };

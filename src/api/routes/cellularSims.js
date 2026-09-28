'use strict';

const simManager = require('../../cellular/simManager');
const { isCellularSimsEnabled } = require('../../cellular/cellularSimsEnabled');
const { normalizeCellularSimsSettings } = require('../../cellular/cellularSettings');
const persistence = require('../../persistence');

function requireCellularSims(req, res, next) {
  if (!isCellularSimsEnabled()) {
    return res.status(403).json({
      error: 'Cellular SIM management requires PEAKLOGIC_DEPLOYMENT=cloud, PEAKLOGIC_CELLULAR_SIMS=1, or settings cellularSims.enabled',
    });
  }
  return next();
}

function createCellularSimRoutes() {
  const router = require('express').Router();
  router.use(requireCellularSims);

  router.get('/cellular/sims/status', (req, res) => {
    res.json({ ok: true, ...simManager.managerStatus() });
  });

  router.get('/cellular/vendors/catalog', (req, res) => {
    res.json({ ok: true, vendors: simManager.listVendorCatalog() });
  });

  router.get('/cellular/vendors', (req, res) => {
    res.json({ ok: true, vendors: simManager.listConfiguredVendors() });
  });

  router.post('/cellular/vendors', (req, res) => {
    try {
      const vendor = simManager.addVendorConfig(req.body || {});
      res.status(201).json({ ok: true, vendor });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.put('/cellular/vendors/:id', (req, res) => {
    try {
      const vendor = simManager.updateVendorConfig(req.params.id, req.body || {});
      if (!vendor) return res.status(404).json({ error: 'Vendor config not found' });
      return res.json({ ok: true, vendor });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.delete('/cellular/vendors/:id', (req, res) => {
    try {
      const ok = simManager.removeVendorConfig(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Vendor config not found' });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cellular/vendors/:id/test', async (req, res) => {
    try {
      const result = await simManager.testVendorConnection(req.params.id);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  router.put('/cellular/settings', (req, res) => {
    try {
      const settings = persistence.readJson('settings.json', {});
      const next = normalizeCellularSimsSettings(req.body, settings.cellularSims || {});
      settings.cellularSims = next;
      persistence.writeJson('settings.json', settings);
      res.json({ ok: true, cellularSims: next });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cellular/sync', async (req, res) => {
    try {
      const result = await simManager.syncAll();
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cellular/sims', async (req, res) => {
    try {
      const filter = {};
      if (req.query.vendor) filter.vendor = req.query.vendor;
      if (req.query.tenantId) filter.tenantId = req.query.tenantId;
      if (req.query.deviceId) filter.deviceId = req.query.deviceId;
      if (req.query.sync === '1' || req.query.sync === 'true') {
        await simManager.syncAll();
      }
      const sims = await simManager.listSims(filter);
      res.json({ ok: true, sims, count: sims.length });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cellular/sims/:id', async (req, res) => {
    try {
      const sim = await simManager.getSim(req.params.id);
      if (!sim) return res.status(404).json({ error: 'SIM not found' });
      return res.json({ ok: true, sim });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.put('/cellular/sims/:id/link', async (req, res) => {
    try {
      const sim = await simManager.linkSim(req.params.id, req.body || {});
      if (!sim) return res.status(404).json({ error: 'SIM not found' });
      return res.json({ ok: true, sim });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cellular/sims/:id/activate', async (req, res) => {
    try {
      const result = await simManager.activateSim(req.params.id);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  router.post('/cellular/sims/:id/deactivate', async (req, res) => {
    try {
      const result = await simManager.deactivateSim(req.params.id);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  router.get('/cellular/sims/:id/usage', async (req, res) => {
    try {
      const usage = await simManager.getSimUsage(req.params.id);
      res.json({ ok: true, usage });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  router.post('/cellular/billing/sync', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await simManager.syncSimetryBilling({
        vendorConfigId: body.vendorConfigId || req.query.vendorConfigId,
        tenantId: body.tenantId || req.query.tenantId,
        periodStart: body.periodStart || req.query.periodStart,
        periodEnd: body.periodEnd || req.query.periodEnd,
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  router.get('/cellular/billing/report', async (req, res) => {
    try {
      const report = await simManager.getBillingReport({
        vendor: req.query.vendor || 'simetry',
        vendorConfigId: req.query.vendorConfigId,
        tenantId: req.query.tenantId,
        periodStart: req.query.periodStart,
        periodEnd: req.query.periodEnd,
        live: req.query.live,
      });
      res.json({ ok: true, report });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  router.get('/cellular/billing/export', async (req, res) => {
    try {
      const csv = await simManager.exportBillingCsv({
        vendor: req.query.vendor || 'simetry',
        vendorConfigId: req.query.vendorConfigId,
        tenantId: req.query.tenantId,
        periodStart: req.query.periodStart,
        periodEnd: req.query.periodEnd,
        live: req.query.live,
      });
      const period = req.query.periodStart || 'billing';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="simetry-billing-${period}.csv"`);
      res.send(csv);
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  router.get('/cellular/gateway/reports', (req, res) => {
    try {
      const reports = simManager.listGatewayCellularReports();
      res.json({ ok: true, reports, count: reports.length });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cellular/gateway/auto-link', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await simManager.autoLinkFromGateway(body);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createCellularSimRoutes, requireCellularSims };

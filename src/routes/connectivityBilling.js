'use strict';

const billingService = require('../connectivity/connectivityBillingService');
const { readConnectivityBillingSettings, writeConnectivityBillingSettings } = require('../connectivity/connectivityBillingSettings');
const { getRenewalScheduler } = require('../api/connectivityRenewalHolder');
const { authenticate } = require('../auth/middleware');
const { asyncHandler } = require('../util/http');

function createConnectivityBillingRoutes() {
  const router = require('express').Router();
  router.use(authenticate);

  router.get('/connectivity/billing/status', (req, res) => {
    const scheduler = getRenewalScheduler();
    res.json({
      ok: true,
      enabled: billingService.isEnabled(),
      settings: readConnectivityBillingSettings(),
      scheduler: scheduler?.status?.() || null,
    });
  });

  router.get('/connectivity/billing', asyncHandler(async (req, res) => {
    const records = await billingService.listBillingRecords(req.auth.tenantId, {
      status: req.query.status || undefined,
    });
    res.json({ ok: true, records, count: records.length });
  }));

  router.get('/connectivity/sites', asyncHandler(async (req, res) => {
    const sites = await billingService.listCommissioningSites(req.auth.tenantId);
    res.json({
      ok: true,
      sites,
      count: sites.length,
      settings: readConnectivityBillingSettings(),
    });
  }));

  router.put('/connectivity/sites/:systemId/contact', asyncHandler(async (req, res) => {
    const result = await billingService.updateSiteContactEmail(
      req.auth.tenantId,
      req.params.systemId,
      req.body?.contactEmail,
    );
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result);
  }));

  router.get('/connectivity/billing/system/:systemId', asyncHandler(async (req, res) => {
    const record = await billingService.getBillingForSystem(req.auth.tenantId, req.params.systemId);
    if (!record) return res.status(404).json({ error: 'No billing record for this site' });
    return res.json({ ok: true, record });
  }));

  router.post('/connectivity/billing/:id/renew', asyncHandler(async (req, res) => {
    const records = await billingService.listBillingRecords(req.auth.tenantId);
    const existing = records.find((r) => r.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Billing record not found' });
    const result = await billingService.renewBillingRecord(existing.id, {
      type: 'manual',
      termMonths: req.body.termMonths,
      activateSim: req.body.activateSim !== false,
    });
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result);
  }));

  router.post('/connectivity/billing/renew-due', asyncHandler(async (req, res) => {
    if (req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Admin required to run renewal job' });
    }
    const scheduler = getRenewalScheduler();
    const result = scheduler?.runNow
      ? await scheduler.runNow({ force: req.body.force === true })
      : await billingService.processDueRenewals({ force: req.body.force === true });
    return res.json({ ok: true, ...result });
  }));

  router.put('/connectivity/billing/settings', asyncHandler(async (req, res) => {
    if (req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Admin required' });
    }
    const next = writeConnectivityBillingSettings(req.body || {});
    return res.json({ ok: true, connectivityBilling: next });
  }));

  return router;
}

module.exports = { createConnectivityBillingRoutes };

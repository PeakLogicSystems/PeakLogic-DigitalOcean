'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { authenticate, requireRole } = require('../auth/middleware');
const fleetService = require('../services/fleetService');
const fleetImportService = require('../services/fleetImportService');
const { listStationTypes } = require('../fleet/stationTypes');
const authService = require('../services/authService');

const router = express.Router();
router.use(authenticate);

async function loadUser(req) {
  return authService.getUserById(req.auth.tenantId, req.auth.userId);
}

router.get('/station-types', (req, res) => {
  res.json({ stationTypes: listStationTypes() });
});

router.get('/stations', asyncHandler(async (req, res) => {
  const user = await loadUser(req);
  const stations = await fleetService.listStations(req.auth.tenantId, {
    county: req.query.county,
    stationType: req.query.stationType,
    alarmOnly: req.query.alarmOnly === '1' || req.query.alarmOnly === 'true',
  }, user, req.auth.role);
  res.json({ stations });
}));

router.get('/stations/:id', asyncHandler(async (req, res) => {
  const result = await fleetService.getStationDetail(req.auth.tenantId, req.params.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ station: result.station });
}));

router.get('/alarms', asyncHandler(async (req, res) => {
  const user = await loadUser(req);
  const alarms = await fleetService.listAlarms(req.auth.tenantId, {
    county: req.query.county,
    stationType: req.query.stationType,
  }, user, req.auth.role);
  res.json({ alarms });
}));

router.post('/stations/:id/ack', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const result = await fleetService.ackStationAlarm(req.auth.tenantId, req.params.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
}));

router.get('/reports/daily', asyncHandler(async (req, res) => {
  const user = await loadUser(req);
  const report = await fleetService.buildDailyReport(req.auth.tenantId, {
    county: req.query.county,
  }, user, req.auth.role);
  res.json({ report });
}));

router.post('/import', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const csv = req.body?.csv || req.body?.text || '';
  if (!String(csv).trim()) return res.status(400).json({ error: 'csv body required' });
  const result = await fleetImportService.importStationsCsv(req.auth.tenantId, csv);
  res.json(result);
}));

module.exports = router;

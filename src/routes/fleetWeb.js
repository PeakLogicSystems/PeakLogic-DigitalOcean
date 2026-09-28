'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { asyncHandler } = require('../util/http');
const { attachAuth, requireWebAuth } = require('../auth/middleware');
const { loadShellContext, applyShellLocals } = require('../web/shellContext');
const fleetService = require('../services/fleetService');
const { listStationTypes } = require('../fleet/stationTypes');
const { countiesByRegion, COVERAGE_RADIUS_M } = require('../fleet/floridaCounties');
const authService = require('../services/authService');

const router = express.Router();
router.use(attachAuth, requireWebAuth);

function canManageFleet(req) {
  return req.auth?.role === 'admin' || req.auth?.role === 'operator';
}

router.get('/', asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.auth.tenantId, req.auth.userId);
  const ctx = await loadShellContext(req);
  applyShellLocals(res, ctx, { activeNav: 'fleet', title: 'Assets', version: APP_VERSION });
  const stations = await fleetService.listStations(req.auth.tenantId, {
    county: req.query.county,
    stationType: req.query.stationType,
  }, user, req.auth.role);
  const alarms = await fleetService.listAlarms(req.auth.tenantId, {
    county: req.query.county,
  }, user, req.auth.role);
  const counties = [...new Set(stations.map((s) => s.county).filter(Boolean))].sort();
  const coverageCounties = fleetService.listAccessibleCounties(user, req.auth.role);
  const assignedSlugs = user?.profile?.fleetScopes?.counties || null;
  const defaultChecked = assignedSlugs && assignedSlugs.length
    ? assignedSlugs
    : coverageCounties.map((c) => c.slug);
  const coverageSet = new Set(coverageCounties.map((c) => c.slug));
  const coverageRegions = {};
  for (const [region, list] of Object.entries(countiesByRegion())) {
    const filtered = list.filter((c) => coverageSet.has(c.slug));
    if (filtered.length) coverageRegions[region] = filtered;
  }
  res.render('fleet/index', {
    stations,
    alarms,
    counties,
    coverageCounties,
    coverageRegions,
    coverageRadiusM: COVERAGE_RADIUS_M,
    defaultCoverageSlugs: defaultChecked,
    stationTypes: listStationTypes(),
    filters: {
      county: req.query.county || '',
      stationType: req.query.stationType || '',
    },
    importResult: req.query.imported === '1' ? { created: req.query.created, errors: req.query.errors } : null,
    canManage: canManageFleet(req),
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'fleet',
  });
}));

router.get('/stations/:id', asyncHandler(async (req, res) => {
  const result = await fleetService.getStationDetail(req.auth.tenantId, req.params.id);
  if (!result.ok) return res.status(404).send('Station not found');
  const ctx = await loadShellContext(req);
  applyShellLocals(res, ctx, { activeNav: 'fleet', title: result.station.name, version: APP_VERSION });
  res.render('fleet/station', {
    station: result.station,
    canManage: canManageFleet(req),
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'fleet',
  });
}));

router.post('/import', asyncHandler(async (req, res) => {
  if (!canManageFleet(req)) return res.status(403).send('Forbidden');
  const fleetImportService = require('../services/fleetImportService');
  const result = await fleetImportService.importStationsCsv(req.auth.tenantId, req.body.csv || '');
  const params = new URLSearchParams({
    imported: '1',
    created: String(result.created),
    errors: String(result.errors.length),
  });
  res.redirect(`/fleet?${params.toString()}`);
}));

router.post('/stations/:id/ack', asyncHandler(async (req, res) => {
  if (!canManageFleet(req)) return res.status(403).send('Forbidden');
  await fleetService.ackStationAlarm(req.auth.tenantId, req.params.id);
  res.redirect(`/fleet/stations/${req.params.id}?acked=1`);
}));

router.get('/reports', asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.auth.tenantId, req.auth.userId);
  const ctx = await loadShellContext(req);
  applyShellLocals(res, ctx, { activeNav: 'fleet', title: 'Assets report', version: APP_VERSION });
  const report = await fleetService.buildDailyReport(req.auth.tenantId, {
    county: req.query.county,
  }, user, req.auth.role);
  res.render('fleet/report', {
    report,
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'fleet',
  });
}));

module.exports = router;

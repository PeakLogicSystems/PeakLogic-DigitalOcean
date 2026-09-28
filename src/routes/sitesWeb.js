'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { asyncHandler } = require('../util/http');
const { attachAuth, requireWebAuth } = require('../auth/middleware');
const { loadShellContext, applyShellLocals } = require('../web/shellContext');
const locationService = require('../services/locationService');
const systemService = require('../services/systemService');
const deviceService = require('../services/deviceService');
const fleetService = require('../services/fleetService');
const fleetOnboardingService = require('../services/fleetOnboardingService');
const stationDeployService = require('../services/stationDeployService');
const connectivityBillingService = require('../connectivity/connectivityBillingService');
const installManifestService = require('../connectivity/installManifestService');
const { firmwareStatus, OPTA_RECOMMENDED_FIRMWARE } = require('../drivers/optaProtocol');
const authService = require('../services/authService');
const { listStationTypes } = require('../fleet/stationTypes');
const { listFloridaCounties } = require('../fleet/floridaCounties');
const projectRepositoryService = require('../services/projectRepositoryService');
const { getDb } = require('../db/mongo');
const {
  DEFAULT_CLOUD_IOT_DRIVER,
  CLOUD_IOT_MQTT_DRIVERS,
} = require('../cloud/iotDriverPolicy');

const router = express.Router();
router.use(attachAuth, requireWebAuth);

const DRIVER_TYPES = [...CLOUD_IOT_MQTT_DRIVERS];

function canManageSites(req) {
  return req.auth?.role === 'admin' || req.auth?.role === 'operator';
}

function requireManageSites(req, res, next) {
  if (!canManageSites(req)) {
    return res.status(403).send('Admin or operator access required.');
  }
  return next();
}

function requireTenantAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') {
    return res.status(403).send('Admin access required.');
  }
  return next();
}

async function applySitesShell(req, res, extra = {}) {
  const ctx = await loadShellContext(req);
  applyShellLocals(res, ctx, {
    activeNav: 'sites',
    title: extra.title || 'Sites',
    version: APP_VERSION,
    canManage: canManageSites(req),
    ...extra,
  });
  return ctx;
}

async function systemCountsByLocation(tenantId) {
  const rows = await getDb().collection('systems').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$locationId', count: { $sum: 1 } } },
  ]).toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

router.get('/', asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const locations = await locationService.listLocations(tenantId);
  const systemCounts = await systemCountsByLocation(tenantId);
  const statuses = await fleetService.getSystemStatuses(tenantId);

  // Attach each location's stations (systems) with live online/offline status.
  const enriched = [];
  for (const loc of locations) {
    const sysRes = await systemService.listSystems(tenantId, loc.id);
    const systems = (sysRes.ok ? sysRes.systems : []).map((s) => ({
      ...s,
      stationType: s.metadata?.stationType || null,
      status: (statuses[s.id] || {}).status || 'offline',
      deviceId: (statuses[s.id] || {}).deviceId || null,
      firmwareVersion: (statuses[s.id] || {}).firmwareVersion || null,
      firmwareStatus: (statuses[s.id] || {}).firmwareStatus || 'unknown',
      lastSeenAt: (statuses[s.id] || {}).lastSeenAt || null,
    }));
    enriched.push({ ...loc, systemCount: systemCounts[loc.id] || 0, systems });
  }

  // Selected location for the pulldown (default: first location).
  const selectedLocationId = req.query.locationId
    && enriched.some((l) => l.id === req.query.locationId)
    ? req.query.locationId
    : (enriched[0]?.id || null);

  const ctx = await applySitesShell(req, res, { title: 'Sites' });
  res.render('sites/index', {
    locations: enriched,
    selectedLocationId,
    recommendedFirmware: OPTA_RECOMMENDED_FIRMWARE,
    message: req.query.created === '1'
      ? (req.query.station === '1' ? 'Lift station added.' : 'Location created.')
      : req.query.deleted === '1'
        ? 'Location deleted.'
        : null,
    error: req.query.error || null,
    form: {},
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'sites',
    canManage: canManageSites(req),
  });
}));

function sitesWizardLocals(req, ctx, extra = {}) {
  return {
    title: 'Add lift station',
    stationTypes: listStationTypes(),
    counties: listFloridaCounties(),
    owner: ctx.tenant?.name || '',
    error: null,
    form: {},
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'sites',
    canManage: canManageSites(req),
    ...extra,
  };
}

router.get('/new', requireManageSites, asyncHandler(async (req, res) => {
  const ctx = await applySitesShell(req, res, { title: 'Add lift station' });
  const installToken = String(req.query.install || '').trim();
  let form = {};
  let installHint = null;
  if (installToken) {
    const lookup = await installManifestService.getManifestForInstall(installToken, req.auth.tenantId);
    if (lookup.ok) {
      form = {
        stationType: lookup.manifest.stationType,
        deviceId: lookup.manifest.deviceId,
        deviceSlug: lookup.manifest.deviceId,
      };
      installHint = lookup.manifest;
    }
  }
  res.render('sites/wizard', sitesWizardLocals(req, ctx, { form, installToken, installHint }));
}));

router.post('/new', requireManageSites, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const tenantId = req.auth.tenantId;
  const tenant = await authService.getTenantById(tenantId);
  const result = await fleetOnboardingService.provisionStation(tenantId, tenant?.name || '', {
    stationType: b.stationType,
    stationName: b.stationName,
    stationSlug: b.stationSlug,
    county: b.county,
    address: b.address,
    lat: b.lat,
    lng: b.lng,
    deviceId: b.deviceId,
    deviceSlug: b.deviceSlug,
    scanMs: b.scanMs,
  });
  if (!result.ok) {
    const ctx = await applySitesShell(req, res, { title: 'Add lift station' });
    return res.status(400).render('sites/wizard', sitesWizardLocals(req, ctx, {
      error: result.error,
      form: b,
      installToken: String(b.installToken || '').trim(),
    }));
  }
  const installToken = String(b.installToken || '').trim();
  if (installToken && result.station) {
    try {
      const verify = await installManifestService.verifyDeviceForClaim(
        installToken,
        b.deviceId || result.device?.driverConfig?.deviceId,
      );
      if (verify.ok) {
        await installManifestService.claimManifest(installToken, tenantId, {
          systemId: result.station.id,
          locationId: result.location.id,
          userId: req.auth.userId,
        });
      }
    } catch (err) {
      console.warn('[install-manifest] wizard claim:', err.message || err);
    }
  }
  const params = new URLSearchParams({ created: '1', station: '1', locationId: result.location.id });
  res.redirect(`/sites?${params.toString()}`);
}));

router.post('/', requireManageSites, asyncHandler(async (req, res) => {
  const result = await locationService.createLocation(req.auth.tenantId, {
    name: req.body.name,
    slug: req.body.slug,
    description: req.body.description,
  });
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Could not create location' });
    return res.redirect(`/sites?${params.toString()}`);
  }
  res.redirect(`/sites/${result.location.id}?created=1`);
}));

router.get('/:locationId', asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const location = await locationService.getLocation(tenantId, req.params.locationId);
  if (!location) return res.status(404).send('Location not found');

  const systemsResult = await systemService.listSystems(tenantId, location.id);
  const systems = systemsResult.ok ? systemsResult.systems : [];
  const projects = await projectRepositoryService.listProjects(tenantId, { locationId: location.id });

  const ctx = await applySitesShell(req, res, { title: location.name });
  res.render('sites/location', {
    location,
    systems,
    projects,
    message: req.query.created === '1'
      ? (req.query.type === 'project' ? 'Project published.' : 'System created.')
      : req.query.deleted === '1'
        ? (req.query.type === 'project' ? 'Project deleted.' : 'Location deleted.')
        : null,
    error: req.query.error || null,
    form: {},
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'sites',
    canManage: canManageSites(req),
  });
}));

router.post('/:locationId/systems', requireManageSites, asyncHandler(async (req, res) => {
  const { locationId } = req.params;
  const result = await systemService.createSystem(req.auth.tenantId, locationId, {
    name: req.body.name,
    slug: req.body.slug,
    description: req.body.description,
    scanMs: req.body.scanMs,
  });
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Could not create system' });
    return res.redirect(`/sites/${locationId}?${params.toString()}`);
  }
  res.redirect(`/sites/${locationId}/systems/${result.system.id}?created=1`);
}));

router.post('/:locationId/projects/:projectId/delete', requireTenantAdmin, asyncHandler(async (req, res) => {
  const { locationId, projectId } = req.params;
  try {
    await projectRepositoryService.deleteProject(req.auth.tenantId, projectId, { locationId });
  } catch (err) {
    const params = new URLSearchParams({ error: err.message || 'Could not delete project' });
    return res.redirect(`/sites/${locationId}?${params.toString()}`);
  }
  res.redirect(`/sites/${locationId}?deleted=1&type=project`);
}));

router.post('/:locationId/delete', requireTenantAdmin, asyncHandler(async (req, res) => {
  const result = await locationService.deleteLocation(req.auth.tenantId, req.params.locationId);
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Could not delete location' });
    return res.redirect(`/sites/${req.params.locationId}?${params.toString()}`);
  }
  res.redirect('/sites?deleted=1');
}));

router.get('/:locationId/systems/:systemId', asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const location = await locationService.getLocation(tenantId, req.params.locationId);
  if (!location) return res.status(404).send('Location not found');

  const system = await systemService.getSystem(tenantId, req.params.systemId);
  if (!system || system.locationId !== location.id) {
    return res.status(404).send('System not found');
  }

  const devicesResult = await deviceService.listDevices(tenantId, system.id);
  const devices = devicesResult.ok ? devicesResult.devices : [];

  const statuses = await fleetService.getSystemStatuses(tenantId);
  const status = statuses[system.id] || { status: 'offline', online: false, deviceId: null };
  const primaryDeviceId = devices[0]?.driverConfig?.deviceId || null;
  const stationProfile = require('../fleet/stationTypes').getStationType(system.metadata?.stationType) || null;

  let runtime = null;
  let lastSeenAt = null;
  let firmwareVersion = null;
  if (primaryDeviceId) {
    const latest = await getDb().collection('device_telemetry_latest').findOne(
      { tenantId, deviceId: primaryDeviceId },
      { projection: { runtime: 1, receivedAt: 1, firmwareVersion: 1 } },
    );
    runtime = latest?.runtime || null;
    lastSeenAt = latest?.receivedAt || null;
    firmwareVersion = latest?.firmwareVersion || null;
    if (!firmwareVersion) {
      const parc = await getDb().collection('parc_devices').findOne(
        { tenantId, deviceId: primaryDeviceId },
        { projection: { firmwareVersion: 1 } },
      );
      firmwareVersion = parc?.firmwareVersion || null;
    }
  }

  const ctx = await applySitesShell(req, res, { title: system.name });
  let connectivityBilling = null;
  try {
    connectivityBilling = await connectivityBillingService.getBillingForSystem(tenantId, system.id);
  } catch (err) {
    console.warn('[sites] connectivity billing:', err.message || err);
  }

  const installToken = String(req.query.install || '').trim();
  let installPrefill = null;
  if (installToken) {
    const lookup = await installManifestService.getManifestForInstall(installToken, tenantId);
    if (lookup.ok) installPrefill = lookup;
  }
  const boundId = primaryDeviceId || installPrefill?.manifest?.deviceId || null;

  res.render('sites/system', {
    location,
    system,
    devices,
    status,
    primaryDeviceId,
    installToken: installPrefill ? installToken : '',
    installPrefill: installPrefill?.manifest || null,
    stationProfile,
    runtime,
    lastSeenAt,
    firmwareVersion,
    firmwareState: firmwareStatus(firmwareVersion),
    recommendedFirmware: OPTA_RECOMMENDED_FIRMWARE,
    connectivityBilling,
    deployFailed: req.query.deployFailed === '1',
    deployJustSucceeded: req.query.deployed === '1',
    driverTypes: DRIVER_TYPES,
    defaultDriverType: DEFAULT_CLOUD_IOT_DRIVER,
    message: req.query.deployed === '1'
      ? (req.query.warning
        ? `Program deployed to device. ${req.query.warning}`
        : 'Program downloaded to the Opta, auto-run on boot enabled, and runtime started.')
      : req.query.bound === '1'
        ? 'Edge device bound. Use Deploy below to download the station program and enable auto-run after power-up.'
        : req.query.created === '1'
          ? 'Device created.'
          : req.query.deleted === '1'
            ? 'System deleted.'
            : null,
    error: req.query.error || null,
    form: {},
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'sites',
    canManage: canManageSites(req),
  });
}));

router.post('/:locationId/systems/:systemId/devices', requireManageSites, asyncHandler(async (req, res) => {
  const { locationId, systemId } = req.params;
  const deviceId = String(req.body.deviceId || req.body.slug || '').trim();
  const driverConfig = deviceId ? { deviceId } : {};
  const result = await deviceService.createDevice(req.auth.tenantId, systemId, {
    name: req.body.name,
    slug: req.body.slug,
    driverType: req.body.driverType || DEFAULT_CLOUD_IOT_DRIVER,
    templateId: req.body.templateId || null,
    driverConfig,
  });
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Could not create device' });
    return res.redirect(`/sites/${locationId}/systems/${systemId}?${params.toString()}`);
  }
  res.redirect(`/sites/${locationId}/systems/${systemId}?created=1`);
}));

// Bind the edge device by pasting the Device ID from the Opta's own web page.
// One field: the rest (name, slug, template, program) is derived automatically.
router.post('/:locationId/systems/:systemId/bind-device', requireManageSites, asyncHandler(async (req, res) => {
  const { locationId, systemId } = req.params;
  const tenantId = req.auth.tenantId;
  const deviceId = String(req.body.deviceId || '').trim();
  const installToken = String(req.body.installToken || '').trim();
  const back = `/sites/${locationId}/systems/${systemId}`;
  if (!deviceId) {
    return res.redirect(`${back}?${new URLSearchParams({ error: 'Enter the Device ID from the Opta /setup page' })}`);
  }

  const system = await systemService.getSystem(tenantId, systemId);
  if (!system || system.locationId !== locationId) return res.status(404).send('System not found');

  const meta = system.metadata || {};
  const profile = require('../fleet/stationTypes').getStationType(meta.stationType);
  const templateId = meta.templateId || profile?.templateId || null;
  const slug = require('../util/slug').normalizeSlug(deviceId);

  const devicesResult = await deviceService.listDevices(tenantId, systemId);
  const primary = (devicesResult.ok ? devicesResult.devices : [])[0];

  let result;
  if (primary) {
    result = await deviceService.updateDevice(tenantId, primary.id, {
      slug,
      driverConfig: { ...(primary.driverConfig || {}), deviceId },
      templateId: primary.templateId || templateId,
    });
  } else {
    result = await deviceService.createDevice(tenantId, systemId, {
      name: `${system.name} controller`,
      slug,
      driverType: DEFAULT_CLOUD_IOT_DRIVER,
      templateId,
      driverConfig: { deviceId },
    });
  }
  if (!result.ok) {
    return res.redirect(`${back}?${new URLSearchParams({ error: result.error || 'Could not bind device' })}`);
  }
  try {
    await connectivityBillingService.ensurePendingBillingRecord({
      tenantId,
      systemId,
      locationId,
      deviceId,
    });
  } catch (e) {
    console.warn('[connectivity-billing] bind-device:', e.message || e);
  }
  if (installToken) {
    try {
      const verify = await installManifestService.verifyDeviceForClaim(installToken, deviceId);
      if (verify.ok) {
        await installManifestService.claimManifest(installToken, tenantId, {
          systemId,
          locationId,
          userId: req.auth.userId,
        });
      }
    } catch (e) {
      console.warn('[install-manifest] bind-device:', e.message || e);
    }
  }
  return res.redirect(`${back}?${new URLSearchParams({ bound: '1' })}`);
}));

router.post('/:locationId/systems/:systemId/deploy', requireManageSites, asyncHandler(async (req, res) => {
  const { locationId, systemId } = req.params;
  const tenantId = req.auth.tenantId;
  const back = `/sites/${locationId}/systems/${systemId}`;
  const autoRunOnBoot = req.body.autoRunOnBoot !== 'false' && req.body.autoRunOnBoot !== '0';

  const result = await stationDeployService.deployStationProgram({
    tenantId,
    systemId,
    autoRunOnBoot,
    start: true,
  });

  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Deploy failed', deployFailed: '1' });
    return res.redirect(`${back}?${params.toString()}`);
  }
  const params = new URLSearchParams({ deployed: '1' });
  if (result.warning) params.set('warning', result.warning);
  return res.redirect(`${back}?${params.toString()}`);
}));

router.post('/:locationId/systems/:systemId/delete', requireTenantAdmin, asyncHandler(async (req, res) => {
  const { locationId, systemId } = req.params;
  const result = await systemService.deleteSystem(req.auth.tenantId, systemId);
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Could not delete system' });
    return res.redirect(`/sites/${locationId}/systems/${systemId}?${params.toString()}`);
  }
  res.redirect(`/sites/${locationId}?deleted=1`);
}));

router.post('/:locationId/systems/:systemId/devices/:deviceId/delete', requireTenantAdmin, asyncHandler(async (req, res) => {
  const { locationId, systemId, deviceId } = req.params;
  const result = await deviceService.deleteDevice(req.auth.tenantId, deviceId);
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Could not delete device' });
    return res.redirect(`/sites/${locationId}/systems/${systemId}?${params.toString()}`);
  }
  res.redirect(`/sites/${locationId}/systems/${systemId}?deleted=1`);
}));

module.exports = router;

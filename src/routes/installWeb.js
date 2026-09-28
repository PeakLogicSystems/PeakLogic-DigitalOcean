'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { attachAuth } = require('../auth/middleware');
const { asyncHandler } = require('../util/http');
const { loadShellContext, applyShellLocals } = require('../web/shellContext');
const installManifestService = require('../connectivity/installManifestService');
const { getDb } = require('../db/mongo');

const router = express.Router();
router.use(attachAuth);

router.get('/install', (req, res) => {
  const token = String(req.query.t || req.query.token || '').trim();
  if (token) return res.redirect(`/install/${encodeURIComponent(token)}`);
  return res.redirect('/sites');
});

router.get('/install/:token', asyncHandler(async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!req.auth) {
    return res.redirect(`/login?next=${encodeURIComponent(`/install/${token}`)}`);
  }

  const result = await installManifestService.getManifestForInstall(token, req.auth.tenantId);
  const ctx = await loadShellContext(req);
  applyShellLocals(res, ctx, { activeNav: 'sites', title: 'Device install', version: APP_VERSION });

  if (!result.ok) {
    return res.status(result.status || 404).render('install/scan', {
      title: 'Device install',
      error: result.error,
      manifest: null,
      profile: null,
      systems: [],
      installUrl: installManifestService.buildInstallUrl(req, token),
      user: ctx.user,
      tenant: ctx.tenant,
      cmmsEnabled: ctx.cmmsEnabled,
      activeNav: 'sites',
    });
  }

  const systems = await getDb().collection('systems')
    .find({ tenantId: req.auth.tenantId })
    .sort({ name: 1 })
    .toArray();
  const devices = await getDb().collection('devices')
    .find({ tenantId: req.auth.tenantId })
    .toArray();
  const deviceBySystem = new Map();
  for (const dev of devices) {
    if (!deviceBySystem.has(dev.systemId)) deviceBySystem.set(dev.systemId, dev);
  }

  const bindTargets = systems.map((sys) => {
    const dev = deviceBySystem.get(sys._id);
    const boundId = dev?.driverConfig?.deviceId || null;
    return {
      systemId: sys._id,
      systemName: sys.name,
      locationId: sys.locationId,
      boundId,
      needsBind: !boundId || boundId !== result.manifest.deviceId,
      bindUrl: `/sites/${sys.locationId}/systems/${sys._id}?install=${encodeURIComponent(token)}`,
    };
  });

  return res.render('install/scan', {
    title: 'Device install',
    error: null,
    manifest: result.manifest,
    profile: result.profile,
    claimed: result.claimed,
    siteUrl: result.siteUrl,
    systems: bindTargets,
    installUrl: installManifestService.buildInstallUrl(req, token),
    wizardUrl: `/sites/new?install=${encodeURIComponent(token)}`,
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'sites',
  });
}));

module.exports = router;

'use strict';

const installManifestService = require('../connectivity/installManifestService');
const { authenticate } = require('../auth/middleware');
const { asyncHandler } = require('../util/http');
const { listStationTypes } = require('../fleet/stationTypes');

function createInstallManifestRoutes() {
  const router = require('express').Router();
  router.use(authenticate);

  router.get('/install/manifests', asyncHandler(async (req, res) => {
    const status = req.query.status || undefined;
    const manifests = await installManifestService.listManifests({
      status,
      tenantId: status === 'claimed' ? req.auth.tenantId : undefined,
      limit: req.query.limit,
    });
    res.json({
      ok: true,
      manifests,
      count: manifests.length,
      stationTypes: listStationTypes(),
    });
  }));

  router.post('/install/manifests', asyncHandler(async (req, res) => {
    if (req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Admin required to register install stickers' });
    }
    const result = await installManifestService.registerManifest({
      deviceId: req.body.deviceId,
      stationType: req.body.stationType,
      serialNumber: req.body.serialNumber,
      iccid: req.body.iccid,
      notes: req.body.notes,
      registeredBy: req.auth.userId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({
      ok: true,
      manifest: result.manifest,
      existing: Boolean(result.existing),
      installPath: installManifestService.buildInstallPath(result.manifest.token),
      installUrl: installManifestService.buildInstallUrl(req, result.manifest.token),
    });
  }));

  router.get('/install/manifests/:token', asyncHandler(async (req, res) => {
    const result = await installManifestService.getManifestForInstall(
      req.params.token,
      req.auth.tenantId,
    );
    if (!result.ok) return res.status(result.status || 404).json({ error: result.error });
    return res.json({
      ok: true,
      ...result,
      installPath: installManifestService.buildInstallPath(req.params.token),
      installUrl: installManifestService.buildInstallUrl(req, req.params.token),
    });
  }));

  return router;
}

module.exports = { createInstallManifestRoutes };

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { version: APP_VERSION } = require('../../package.json');
const { attachAuth } = require('../auth/middleware');
const { createExpressApi } = require('../api/expressRouter');
let createCloudStudioUserRoutes;
try {
  ({ createCloudStudioUserRoutes } = require('../api/routes/cloudStudioUsers'));
} catch (err) {
  console.warn('[studio] cloudStudioUser routes unavailable:', err.message);
  createCloudStudioUserRoutes = () => express.Router();
}
const { DEPLOYMENT_MODE } = require('../config');
const { getTenantRuntime, runInTenantContext } = require('../runtime/tenantRuntimePool');
const { asyncHandler } = require('../util/http');
const { loadShellContext } = require('../web/shellContext');

function requireStudioAuth(req, res, next) {
  if (req.auth) return next();
  const wantsJson = req.originalUrl.startsWith('/api/studio')
    || (req.headers.accept && req.headers.accept.includes('application/json'));
  if (wantsJson) return res.status(401).json({ error: 'Login required' });
  return res.redirect('/login?next=/studio');
}

function withTenantRuntime(handler) {
  return asyncHandler(async (req, res, next) => {
    const entry = await getTenantRuntime(req.auth.tenantId);
    req.tenantRuntime = entry;
    return runInTenantContext(req.auth.tenantId, () => Promise.resolve(handler(req, res, next)));
  });
}

function createStudioAuthRouter() {
  const router = express.Router();
  router.use(attachAuth);
  router.use(requireStudioAuth);
  return router;
}

function createStudioRoutes() {
  const router = express.Router();

  const studioWeb = createStudioAuthRouter();

  async function renderConnectivityPage(req, res) {
    const { isCellularSimsEnabled } = require('../cellular/cellularSimsEnabled');
    if (!isCellularSimsEnabled()) {
      return res.redirect('/studio');
    }
    const ctx = await loadShellContext(req);
    if (!ctx) {
      return res.redirect('/login?next=/studio/connectivity');
    }
    const highlightSystemId = String(req.query.systemId || '').trim();
    const { listStationTypes } = require('../fleet/stationTypes');
    res.render('cellular-sims', {
      title: 'Connectivity',
      assetV: APP_VERSION,
      appVersion: APP_VERSION,
      product: 'cloud-studio',
      deployment: DEPLOYMENT_MODE,
      peaklogicApiBase: '/api/studio',
      peaklogicPlatformApi: '/api',
      homeUrl: '/studio',
      connectivityBuild: 'commissioning-v2-qr',
      useShellNav: true,
      stationTypes: listStationTypes(),
      user: ctx.user,
      tenant: ctx.tenant,
      cmmsEnabled: ctx.cmmsEnabled,
      activeNav: 'connectivity',
      highlightSystemId,
    });
  }

  studioWeb.get('/connectivity', withTenantRuntime(renderConnectivityPage));
  studioWeb.get(
    '/cellular/sims',
    (req, res) => {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(`/studio/connectivity${qs}`);
    },
  );
  studioWeb.get(
    '/',
    withTenantRuntime((req, res) => {
      const studioLocationId = String(req.query.locationId || req.query.location || '').trim();
      res.render('scada-dashboard', {
        title: 'PeakLogic Studio',
        assetV: APP_VERSION,
        product: 'cloud-studio',
        deployment: DEPLOYMENT_MODE,
        peaklogicApiBase: '/api/studio',
        studioLocationId,
      });
    }),
  );
  studioWeb.use(
    '/hmi/user',
    withTenantRuntime((req, res, next) => {
      const importsDir = path.join(req.tenantRuntime.paths.dataDir, 'hmi-imports');
      if (!fs.existsSync(importsDir)) fs.mkdirSync(importsDir, { recursive: true });
      return express.static(importsDir, { fallthrough: false })(req, res, next);
    }),
  );
  router.use('/studio', studioWeb);

  const studioApi = createStudioAuthRouter();
  if (DEPLOYMENT_MODE === 'cloud') {
    studioApi.use(createCloudStudioUserRoutes());
  }
  studioApi.use(
    '/',
    withTenantRuntime((req, res, next) => {
      const api = createExpressApi({
        ...req.tenantRuntime.deps,
        tenantId: req.auth.tenantId,
      });
      return api(req, res, next);
    }),
  );
  router.use('/api/studio', studioApi);

  return router;
}

module.exports = { createStudioRoutes, requireStudioAuth };

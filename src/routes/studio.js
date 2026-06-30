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
  studioWeb.get(
    '/cellular/sims',
    withTenantRuntime((req, res) => {
      const { DEPLOYMENT_MODE } = require('../config');
      const { isCellularSimsEnabled } = require('../cellular/cellularSimsEnabled');
      if (!isCellularSimsEnabled()) {
        return res.redirect('/studio');
      }
      res.render('cellular-sims', {
        title: 'Connectivity — MooreVIEW',
        assetV: APP_VERSION,
        appVersion: APP_VERSION,
        product: 'cloud-studio',
        deployment: DEPLOYMENT_MODE,
        mooreviewApiBase: '/api/studio',
        homeUrl: '/studio',
        connectivityBuild: 'email-sms-v2',
      });
    }),
  );
  studioWeb.get(
    '/',
    withTenantRuntime((req, res) => {
      res.render('scada-dashboard', {
        title: 'mooreVIEW Studio',
        assetV: APP_VERSION,
        product: 'cloud-studio',
        mooreviewApiBase: '/api/studio',
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
      const api = createExpressApi(req.tenantRuntime.deps);
      return api(req, res, next);
    }),
  );
  router.use('/api/studio', studioApi);

  return router;
}

module.exports = { createStudioRoutes, requireStudioAuth };

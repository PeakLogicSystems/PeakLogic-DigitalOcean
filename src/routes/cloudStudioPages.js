'use strict';

const express = require('express');
const { requireAuth } = require('../tenants/authMiddleware');

/**
 * Multi-tenant Cloud Studio HTML routes (SaaS).
 * `/` remains the full Studio dashboard (pages.js).
 */
function createCloudStudioPages(opts = {}) {
  const router = express.Router();
  const appVersion = opts.appVersion || '0.0.0';
  const product = opts.product || process.env.PEAKLOGIC_PRODUCT || 'mvp-suite';

  function renderStudio(req, res, page) {
    res.render('cloud-studio', {
      title: 'PeakLogic Control Center',
      appVersion,
      product,
      deployment: 'cloud',
      role: 'saas',
      page: page || 'sites',
      siteId: req.params.siteId || '',
      // Bump when People/auth UI changes so browsers do not keep stale cloudStudioUi.js
      assetV: `${appVersion}-csui40`,
      user: req.mvAuth?.user || null,
      tenant: req.mvAuth?.tenant || null,
    });
  }

  router.use(requireAuth);
  router.get('/sites', (req, res) => renderStudio(req, res, 'sites'));
  router.get('/sites/devices', (req, res) => renderStudio(req, res, 'devices'));
  router.get('/sites/:siteId', (req, res) => renderStudio(req, res, 'site'));
  router.get('/sites/:siteId/cameras', (req, res) => renderStudio(req, res, 'cameras'));
  router.get('/fleet', (req, res) => renderStudio(req, res, 'fleet'));
  router.get('/admin/tenants', (req, res) => renderStudio(req, res, 'admin'));
  router.get('/admin/mqtt', (req, res) => renderStudio(req, res, 'mqtt'));
  router.get('/people', (req, res) => renderStudio(req, res, 'people'));
  router.get('/partner', (req, res) => renderStudio(req, res, 'partner'));
  router.get('/cmms', (req, res) => renderStudio(req, res, 'cmms'));

  return router;
}

module.exports = { createCloudStudioPages };

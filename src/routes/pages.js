'use strict';

const express = require('express');
const { isCellularSimsEnabled } = require('../cellular/cellularSimsEnabled');
const { isCloudSimsEnabled } = require('../cloud/cloudSimsEnabled');

function createPageRoutes({ appVersion, companyName, product, deployment, estVersion }) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.render('dashboard', {
      title: 'PeakLogic',
      assetV: appVersion,
      appVersion,
      companyName,
      product,
      deployment,
      estVersion,
      cellularSimsEnabled: isCellularSimsEnabled(),
      cloudSimsEnabled: isCloudSimsEnabled(),
    });
  });
  router.get('/peaklogic-draw', (req, res) => {
    res.render('facility-builder', { title: 'Facility Builder', assetV: appVersion, appVersion });
  });
  return router;
}

module.exports = { createPageRoutes };

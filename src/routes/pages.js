'use strict';

const express = require('express');
const { EST_VERSION } = require('../project/estFile');
const { createNextcenturyPortalRoutes } = require('./nextcenturyPortal');
const { isCellularSimsEnabled } = require('../cellular/cellularSimsEnabled');
const { isCloudSimsEnabled } = require('../cloud/cloudSimsEnabled');

function createPageRoutes({ appVersion, product, deployment }) {
  const router = express.Router();
  router.use(createNextcenturyPortalRoutes());
  router.get('/', (req, res) => {
    res.render('dashboard', dashboardViewLocals({ appVersion, product, deployment }));
  });
  router.get('/io-map', (req, res) => {
    res.render('io-map', dashboardViewLocals({ appVersion, product, deployment }));
  });
  router.get('/mv-draw', (req, res) => {
    const embedded = String(req.query.embedded || '').trim() === '1'
      || String(req.query.embedded || '').toLowerCase() === 'true';
    res.render('mv-draw', dashboardViewLocals({ appVersion, product, deployment, embedded }));
  });
  router.get('/cloud/sims', (req, res) => {
    res.render('cloud-sims', dashboardViewLocals({ appVersion, product, deployment }));
  });
  router.get('/cellular/sims', (req, res) => {
    res.render('cellular-sims', connectivityViewLocals(
      dashboardViewLocals({ appVersion, product, deployment }),
    ));
  });
  return router;
}

function connectivityViewLocals(base) {
  return {
    ...base,
    title: 'Connectivity — PeakLogic',
    homeUrl: '/',
    peaklogicApiBase: '/api',
    connectivityBuild: 'email-sms-v2',
  };
}

function dashboardViewLocals({ appVersion, product, deployment, embedded }) {
  const dep = deployment || 'appliance';
  return {
    title: dep === 'cloud' ? 'PeakLogic Cloud Studio' : 'PeakLogic',
    assetV: `${appVersion}-ps15`,
    appVersion,
    product: product || 'mvp-suite',
    deployment: dep,
    isCloud: dep === 'cloud',
    embedded: !!embedded,
    cellularSimsEnabled: isCellularSimsEnabled(),
    cloudSimsEnabled: isCloudSimsEnabled(),
    companyName: 'The Purple Standard',
    estVersion: EST_VERSION,
  };
}

module.exports = { createPageRoutes, dashboardViewLocals, connectivityViewLocals };

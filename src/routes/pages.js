'use strict';

const express = require('express');
const { isCellularSimsEnabled } = require('../cellular/cellularSimsEnabled');
const { isCloudSimsEnabled } = require('../cloud/cloudSimsEnabled');

function dashboardViewLocals({ appVersion, companyName, product, deployment, estVersion }) {
  return {
    title: 'PeakLogic',
    assetV: appVersion,
    appVersion,
    companyName,
    product,
    deployment,
    estVersion,
    cellularSimsEnabled: isCellularSimsEnabled(),
    cloudSimsEnabled: isCloudSimsEnabled(),
  };
}

function connectivityViewLocals(opts) {
  return {
    ...dashboardViewLocals(opts),
    title: 'Connectivity — PeakLogic',
    homeUrl: '/',
    peaklogicApiBase: '/api',
    connectivityBuild: 'email-sms-v2',
  };
}

function createPageRoutes(opts) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.render('dashboard', dashboardViewLocals(opts));
  });
  router.get('/io-map', (req, res) => {
    res.render('io-map', { ...dashboardViewLocals(opts), title: 'I/O Map' });
  });
  router.get('/peaklogic-draw', (req, res) => {
    res.render('facility-builder', { title: 'Facility Builder', assetV: opts.appVersion, appVersion: opts.appVersion });
  });
  router.get('/cellular/sims', (req, res) => {
    res.render('cellular-sims', connectivityViewLocals(opts));
  });
  router.get('/cloud/sims', (req, res) => {
    res.render('cloud-sims', dashboardViewLocals(opts));
  });
  return router;
}

module.exports = { createPageRoutes, dashboardViewLocals, connectivityViewLocals };

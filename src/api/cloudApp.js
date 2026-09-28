'use strict';

/**
 * PeakLogic SaaS platform app (cloud droplet).
 * Cloud Studio UI + REST API + site catalog + outbound agent hub.
 * Not the LAN appliance engineering shell (no Modbus/ONVIF discover).
 */

const path = require('path');
const express = require('express');
const { createExpressApi } = require('./expressRouter');
const { isCloudDeployment } = require('../cloud/agentProtocol');
const { createCloudStudioPages } = require('../routes/cloudStudioPages');
const { ROOT, AUTH_TOKEN } = require('../config');

/**
 * @param {{ tagStore: object, driverManager: object, scanEngine: object, graphHistory: object, appVersion?: string }} deps
 */
function createCloudApp(deps) {
  const app = express();
  const appVersion = deps.appVersion || '0.0.0';
  const publicRoot = path.join(ROOT, 'public');
  const viewsRoot = path.join(ROOT, 'views');

  app.set('view engine', 'ejs');
  app.set('views', viewsRoot);
  app.use(express.json({ limit: '4mb' }));

  // Optional shared-secret gate (PEAKLOGIC_TOKEN). Unset = open UI/API on private droplet.
  if (AUTH_TOKEN) {
    app.use((req, res, next) => {
      if (req.path === '/health') return next();
      const hdr = String(req.headers.authorization || '');
      const q = String(req.query.token || '');
      const cookie = String(req.headers.cookie || '');
      const fromCookie = /(?:^|;\s*)mv_token=([^;]+)/.exec(cookie);
      const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : '';
      const token = bearer || q || (fromCookie ? decodeURIComponent(fromCookie[1]) : '');
      if (token === AUTH_TOKEN) {
        if (q && q === AUTH_TOKEN) {
          res.setHeader('Set-Cookie', `mv_token=${encodeURIComponent(AUTH_TOKEN)}; Path=/; HttpOnly; SameSite=Lax`);
        }
        return next();
      }
      if (req.path.startsWith('/api/') || req.path === '/health') {
        return res.status(401).json({ error: 'Unauthorized — set Authorization: Bearer <PEAKLOGIC_TOKEN>' });
      }
      res.status(401).type('html').send(
        '<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem">'
        + '<h1>PeakLogic Cloud Studio</h1>'
        + '<p>This deployment requires a token. Open <code>/?token=…</code> once, or send Bearer auth.</p>'
        + '</body></html>',
      );
    });
  }

  app.get('/health', (req, res) => {
    const mongoTagLogger = require('../logger/mongoTagLogger');
    const { registry } = require('../parc/deviceRegistry');
    const { getMqttCentralHub } = require('../parc/mqttCentralHub');
    const { siteStore } = require('../cloud/siteStore');
    res.json({
      ok: true,
      app: 'PeakLogic',
      product: process.env.PEAKLOGIC_PRODUCT || 'cloud',
      version: appVersion,
      deployment: isCloudDeployment() ? 'cloud' : 'appliance',
      role: 'saas',
      studio: true,
      tenantId: process.env.PEAKLOGIC_TENANT_ID || 'cloud',
      port: Number(process.env.PORT) || 3100,
      sites: siteStore.listSites().length,
      runtime: deps.scanEngine?.status?.() || null,
      dataDir: process.env.PEAKLOGIC_DATA || null,
      mongo: mongoTagLogger.status(),
      parc: getMqttCentralHub(registry).status(),
    });
  });

  app.use(express.static(publicRoot, { fallthrough: true }));
  app.use('/api', createExpressApi(deps));
  app.use(createCloudStudioPages({ appVersion, product: process.env.PEAKLOGIC_PRODUCT || 'cloud' }));

  return app;
}

module.exports = { createCloudApp };

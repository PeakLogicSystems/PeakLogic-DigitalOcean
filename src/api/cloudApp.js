'use strict';

const express = require('express');
const authRoutes = require('../routes/auth');
const locationRoutes = require('../routes/locations');
const locationSystemsRoutes = require('../routes/locationSystems');
const systemRoutes = require('../routes/systems');
const deviceRoutes = require('../routes/devices');
const { authenticate } = require('../auth/middleware');
const authService = require('../services/authService');
const { asyncHandler } = require('../util/http');
const { CORS_ORIGINS } = require('../config');

function createCloudApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  if (CORS_ORIGINS.length) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && CORS_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') return res.status(204).end();
      return next();
    });
  }

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'mooreview-cloud' });
  });

  app.use('/api/auth', authRoutes);

  app.get('/api/tenant', authenticate, asyncHandler(async (req, res) => {
    const tenant = await authService.getTenantById(req.auth.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ tenant });
  }));

  app.use('/api/locations', locationRoutes);
  app.use('/api/locations/:locationId/systems', locationSystemsRoutes);
  app.use('/api/systems', systemRoutes);
  app.use('/api/devices', deviceRoutes);

  app.use((err, req, res, next) => {
    console.error('[api]', err.message);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createCloudApp };

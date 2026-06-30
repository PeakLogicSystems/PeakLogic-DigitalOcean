'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { authenticate, attachAuth } = require('../auth/middleware');
const projectRepositoryService = require('../services/projectRepositoryService');
const applianceProjectAuth = require('../middleware/applianceProjectAuth');
const { exportFilename } = require('../project/estFile');

const router = express.Router();

router.use(attachAuth);

/** Tenant project catalog (studio user JWT or paired appliance). */
router.get('/catalog', asyncHandler(async (req, res) => {
  const tenantId = await applianceProjectAuth.resolveTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'Login or appliance pairing required' });
  const projects = await projectRepositoryService.listProjects(tenantId);
  res.json({ projects });
}));

router.get('/catalog/:id/est', asyncHandler(async (req, res) => {
  const tenantId = await applianceProjectAuth.resolveTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'Login or appliance pairing required' });
  const row = await projectRepositoryService.loadProjectDoc(tenantId, req.params.id);
  res.json({ doc: row.estDoc, entry: {
    id: String(row._id),
    slug: row.slug,
    name: row.name,
    version: row.version,
  } });
}));

router.get('/catalog/:id/file', asyncHandler(async (req, res) => {
  const tenantId = await applianceProjectAuth.resolveTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'Login or appliance pairing required' });
  const row = await projectRepositoryService.loadProjectDoc(tenantId, req.params.id);
  const name = String(row.estDoc?.project?.name || row.name).trim() || row.name;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(name)}"`);
  res.send(JSON.stringify(row.estDoc, null, 2));
}));

/** Publish from Studio (JWT) or paired appliance (headers). */
router.post('/publish', asyncHandler(async (req, res) => {
  const tenantId = await applianceProjectAuth.resolveTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'Login or appliance pairing required' });
  const doc = req.body?.doc;
  if (!doc || typeof doc !== 'object') {
    return res.status(400).json({ error: 'Missing doc (.est project snapshot)' });
  }
  const name = String(req.body?.name || doc?.project?.name || 'project').trim() || 'project';
  const result = await projectRepositoryService.publishProject(tenantId, name, doc, {
    description: req.body?.description,
    slug: req.body?.slug,
    publishedBy: req.auth?.userId || null,
  });
  res.status(201).json({ ok: true, ...result });
}));

router.delete('/catalog/:id', authenticate, asyncHandler(async (req, res) => {
  await projectRepositoryService.deleteProject(req.auth.tenantId, req.params.id);
  const projects = await projectRepositoryService.listProjects(req.auth.tenantId);
  res.json({ ok: true, projects });
}));

module.exports = router;

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  readActiveProject,
  writeActiveProject,
  newActiveProject,
  saveNamedProject,
  listNamedProjects,
  uploadsDir,
  relativeUploadPath,
  resolveUpload,
} = require('./facilityStore');
const { normalizeFacility } = require('./facilityFormat');
const { listSymbols } = require('./symbolLibrary');
const { buildFacilityPdf } = require('./exportPdf');
const { buildFacilityDxf } = require('./exportDxf');

const ALLOWED_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function createFacilityRoutes() {
  const router = express.Router();

  router.get('/peaklogic-draw/project', (req, res) => {
    res.json({ project: readActiveProject() });
  });

  router.put('/peaklogic-draw/project', (req, res) => {
    try {
      const project = writeActiveProject(req.body?.project || req.body);
      res.json({ ok: true, project });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/peaklogic-draw/project/new', (req, res) => {
    try {
      const project = newActiveProject(req.body || {});
      res.json({ ok: true, project });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/peaklogic-draw/project/save-as', (req, res) => {
    try {
      const name = req.body?.name || readActiveProject().name;
      const project = saveNamedProject(name, req.body?.project || readActiveProject());
      res.json({ ok: true, project });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/peaklogic-draw/projects', (req, res) => {
    res.json({ projects: listNamedProjects() });
  });

  router.get('/peaklogic-draw/symbols', (req, res) => {
    res.json({ symbols: listSymbols() });
  });

  router.get('/peaklogic-draw/background/:file', (req, res) => {
    const full = resolveUpload(req.params.file);
    if (!full) return res.status(404).json({ error: 'Background not found' });
    res.sendFile(full);
  });

  router.post('/peaklogic-draw/background', (req, res) => {
    try {
      const dataUrl = String(req.body?.dataUrl || '');
      const match = /^data:image\/(\w+);base64,(.+)$/i.exec(dataUrl);
      if (!match) {
        return res.status(400).json({ error: 'Expected { dataUrl: "data:image/png;base64,..." }' });
      }
      const extMap = { png: '.png', jpeg: '.jpg', jpg: '.jpg', webp: '.webp' };
      const ext = extMap[match[1].toLowerCase()] || '.png';
      if (!ALLOWED_IMAGE.has(ext)) {
        return res.status(400).json({ error: 'Supported images: PNG, JPG, WEBP' });
      }
      const stamp = Date.now();
      const safe = `bg_${stamp}${ext}`;
      const full = path.join(uploadsDir(), safe);
      const buf = Buffer.from(match[2], 'base64');
      if (!buf.length) {
        return res.status(400).json({ error: 'Empty upload' });
      }
      fs.writeFileSync(full, buf);
      const rel = relativeUploadPath(safe);
      const project = readActiveProject();
      project.background = {
        type: 'image',
        path: rel,
        opacity: 0.55,
      };
      writeActiveProject(project);
      res.json({ ok: true, path: rel, url: `/api/peaklogic-draw/background/${safe}`, project });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/peaklogic-draw/export/pdf', async (req, res) => {
    try {
      const project = normalizeFacility(req.body?.project || readActiveProject());
      const buf = await buildFacilityPdf(project, req.body?.options || {});
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = String(project.name || 'layout').replace(/[^\w.-]+/g, '_').slice(0, 40);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="MVDraw_${name}_${stamp}.pdf"`);
      res.send(buf);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/peaklogic-draw/export/dxf', (req, res) => {
    try {
      const project = normalizeFacility(req.body?.project || readActiveProject());
      const dxf = buildFacilityDxf(project);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = String(project.name || 'layout').replace(/[^\w.-]+/g, '_').slice(0, 40);
      res.setHeader('Content-Type', 'application/dxf');
      res.setHeader('Content-Disposition', `attachment; filename="MVDraw_${name}_${stamp}.dxf"`);
      res.send(dxf);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createFacilityRoutes };

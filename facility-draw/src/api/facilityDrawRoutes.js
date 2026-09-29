'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  readActiveProject,
  writeActiveProject,
  newActiveProject,
  saveNamedProject,
  openNamedProject,
  listNamedProjects,
  uploadsDir,
  relativeUploadPath,
  resolveUpload,
} = require('../facilityDrawStore');
const { normalizeFacilityDraw } = require('../facilityDrawFormat');
const { listSymbols, getSymbol } = require('../symbolLibrary');
const {
  buildFacilityDrawPreviewSvg,
  listBridgedHmiSymbols,
} = require('../symbolBridge');
const { buildFacilityDrawPdf } = require('../exportPdf');
const { buildFacilityDrawDxf } = require('../exportDxf');
const { buildSceneFromFacilityDraw } = require('../sceneFromFacilityDraw');
const { slugFromProject, writeFacilityDraw3dArtifacts } = require('../facilityDrawArtifacts');
const { projectStorageInfo } = require('../facilityDrawStore');
const { mirrorUpload } = require('../../../src/storage/gridfsMirror');
const gridfs = require('../../../src/storage/gridfsStore');
const {
  readPeaklogicProjectContext,
  saveFacilityDrawToPeaklogicProject,
  loadFacilityDrawFromPeaklogicProject,
  saveFacilityDrawToProjectLibrary,
  linkComposerTo3d,
  applyFacilityDrawHmiCompile,
} = require('../projectSync');
const {
  compileFacilityDrawToHmi,
} = require('../facilityDrawToHmi');
const persistence = require('../../../src/persistence');
const {
  packFacilityDraw,
  resolveImportPayload,
  bundleFilename,
} = require('../../../src/project/projectBundle');
const PACKAGE_VERSION = require('../../../package.json').version;

const ALLOWED_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function projectPayload(project) {
  return { project, storage: projectStorageInfo(project) };
}

function createFacilityDrawRoutes() {
  const router = express.Router();

  router.get('/facility-draw/project', (req, res) => {
    res.json(projectPayload(readActiveProject()));
  });

  router.put('/facility-draw/project', (req, res) => {
    try {
      const project = writeActiveProject(req.body?.project || req.body);
      res.json({ ok: true, ...projectPayload(project) });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/project/new', (req, res) => {
    try {
      const project = newActiveProject(req.body || {});
      res.json({ ok: true, ...projectPayload(project) });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/project/save-as', (req, res) => {
    try {
      const fileBase = req.body?.file || req.body?.name;
      if (!fileBase || !String(fileBase).trim()) {
        return res.status(400).json({ error: 'File name is required' });
      }
      const { project, file } = saveNamedProject(
        fileBase,
        req.body?.project || readActiveProject(),
      );
      writeActiveProject(project);
      res.json({ ok: true, ...projectPayload(project), file });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/project/open', (req, res) => {
    try {
      const file = req.body?.file;
      if (!file) return res.status(400).json({ error: 'Missing file' });
      const project = openNamedProject(file);
      res.json({ ok: true, ...projectPayload(project), file: path.basename(String(file)) });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/facility-draw/projects', (req, res) => {
    res.json({ projects: listNamedProjects() });
  });

  router.get('/facility-draw/project/bundle', (req, res) => {
    try {
      const project = readActiveProject();
      const bundle = packFacilityDraw(project, { exportedBy: PACKAGE_VERSION });
      const name = String(project.name || 'layout').trim() || 'layout';
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${bundleFilename(name)}"`);
      res.send(JSON.stringify(bundle, null, 2));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/project/import', (req, res) => {
    try {
      const resolved = resolveImportPayload(req.body);
      if (resolved.type !== 'facilitydraw') {
        return res.status(400).json({ error: 'Expected an Facility Builder bundle or .facilitydraw.json file' });
      }
      const project = writeActiveProject(resolved.doc);
      res.json({
        ok: true,
        ...projectPayload(project),
        importWarnings: resolved.warnings || [],
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/facility-draw/project/context', (req, res) => {
    try {
      const context = readPeaklogicProjectContext();
      res.json({ ok: true, context, storage: projectStorageInfo(readActiveProject()) });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/project/save-to-project', async (req, res) => {
    try {
      const result = saveFacilityDrawToPeaklogicProject(req.body?.project || readActiveProject(), {
        linkComposer: req.body?.linkComposer !== false,
        setComposerMode: req.body?.setComposerMode !== false,
        facilityPlanUrl: req.body?.facilityPlanUrl,
      });
      let libraryId = null;
      try {
        libraryId = await saveFacilityDrawToProjectLibrary();
      } catch (e) {
        console.warn('[facility-draw] project library save:', e.message || e);
      }
      res.json({
        ok: true,
        ...projectPayload(result.project),
        file: result.file,
        estPath: result.estPath,
        estTouched: result.estTouched,
        facilityPlanUrl: result.facilityPlanUrl,
        composerMode: result.composerMode,
        context: result.context,
        libraryId,
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/project/load-from-project', (req, res) => {
    try {
      const result = loadFacilityDrawFromPeaklogicProject();
      res.json({
        ok: true,
        ...projectPayload(result.project),
        file: result.file,
        estPath: result.estPath,
        context: result.context,
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/facility-draw/symbols', (req, res) => {
    try {
      const includeHmi = String(req.query.includeHmi || '').trim() === '1'
        || String(req.query.includeHmi || '').toLowerCase() === 'true';
      const symbols = listSymbols();
      if (!includeHmi) {
        return res.json({ symbols });
      }
      const publicRoot = path.join(__dirname, '../../../public');
      const { listHmiAssets } = require('../../../src/hmi/hmiConfig');
      const hmiAssets = listHmiAssets(publicRoot);
      const bridged = listBridgedHmiSymbols(hmiAssets);
      res.json({
        symbols: [...symbols, ...bridged],
        facilityDrawCount: symbols.length,
        hmiBridgedCount: bridged.length,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.get('/facility-draw/symbols/:type/preview.svg', (req, res) => {
    try {
      const type = decodeURIComponent(String(req.params.type || '').trim());
      const sym = getSymbol(type);
      if (!sym) return res.status(404).send('Symbol not found');
      res.type('image/svg+xml');
      res.send(buildFacilityDrawPreviewSvg(sym));
    } catch (e) {
      res.status(500).send(e.message || String(e));
    }
  });

  router.post('/facility-draw/compile-hmi', (req, res) => {
    try {
      const project = normalizeFacilityDraw(req.body?.project || readActiveProject());
      const publicRoot = path.join(__dirname, '../../../public');
      const compiled = compileFacilityDrawToHmi(project, {
        screenId: req.body?.screenId,
        screenName: req.body?.screenName,
        publicRoot,
      });
      if (req.body?.apply) {
        const applied = applyFacilityDrawHmiCompile(project, compiled, { publicRoot });
        return res.json({ ok: true, applied: true, ...compiled, settings: applied.settings });
      }
      res.json({ ok: true, applied: false, ...compiled });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/facility-draw/background/:file', (req, res) => {
    const full = resolveUpload(req.params.file);
    if (!full) return res.status(404).json({ error: 'Background not found' });
    res.sendFile(full);
  });

  router.post('/facility-draw/background', async (req, res) => {
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
      let gridfsFile = null;
      try {
        gridfsFile = await mirrorUpload(gridfs.BUCKETS.hmi_assets, buf, {
          filename: safe,
          contentType: `image/${match[1].toLowerCase()}`,
          metadata: { source: 'facility-draw-background', path: rel },
        });
      } catch { /* ignore */ }
      const project = readActiveProject();
      project.background = {
        type: 'image',
        path: rel,
        opacity: 0.55,
        gridfsFileId: gridfsFile?.fileId || null,
      };
      writeActiveProject(project);
      res.json({
        ok: true,
        path: rel,
        url: `/api/facility-draw/background/${safe}`,
        gridfsFileId: gridfsFile?.fileId || null,
        project,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/export/pdf', async (req, res) => {
    try {
      const project = normalizeFacilityDraw(req.body?.project || readActiveProject());
      const exportOpts = { ...(req.body?.options || {}) };
      if (req.body?.orientation) exportOpts.orientation = req.body.orientation;
      const buf = await buildFacilityDrawPdf(project, exportOpts);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = String(project.name || 'layout').replace(/[^\w.-]+/g, '_').slice(0, 40);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="FacilityDraw_${name}_${stamp}.pdf"`);
      res.send(buf);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/export/dxf', (req, res) => {
    try {
      const project = normalizeFacilityDraw(req.body?.project || readActiveProject());
      const exportOpts = { ...(req.body?.options || {}) };
      if (req.body?.orientation) exportOpts.orientation = req.body.orientation;
      const dxf = buildFacilityDrawDxf(project, exportOpts);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = String(project.name || 'layout').replace(/[^\w.-]+/g, '_').slice(0, 40);
      res.setHeader('Content-Type', 'application/dxf');
      res.setHeader('Content-Disposition', `attachment; filename="FacilityDraw_${name}_${stamp}.dxf"`);
      res.send(dxf);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/facility-draw/view-3d', (req, res) => {
    try {
      const project = normalizeFacilityDraw(req.body?.project || readActiveProject());
      const feetPerUnit = Number.isFinite(+req.body?.feetPerUnit) && +req.body.feetPerUnit > 0
        ? +req.body.feetPerUnit
        : 1;
      const site = buildSceneFromFacilityDraw(project, { feetPerUnit });
      const slug = slugFromProject(project, req.body?.slug);
      const artifacts = writeFacilityDraw3dArtifacts(site, slug);

      let facility3dUrl = artifacts.url;
      if (req.body?.linkComposer) {
        const settings = persistence.readJson('settings.json', {});
        const next = linkComposerTo3d(settings, artifacts.url, {
          setComposerMode: req.body?.setComposerMode !== false,
        });
        facility3dUrl = next.hmi?.layout?.facility3dUrl || artifacts.url;
      }

      res.json({
        ok: true,
        url: artifacts.url,
        slug: artifacts.slug,
        facility3dUrl,
        placements: site.placements.length,
        pipes: site.pipes.length,
        zones: site.zones.length,
        typedModels: site.placements.filter((p) => p.model3d && p.model3d !== 'box').length,
        config: `public/samples/${artifacts.configName}`,
        html: `public/samples/${artifacts.htmlName}`,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createFacilityDrawRoutes };

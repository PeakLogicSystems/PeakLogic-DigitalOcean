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
} = require('../mvDrawStore');
const { normalizeMvDraw } = require('../mvDrawFormat');
const { listSymbols, getSymbol } = require('../symbolLibrary');
const {
  buildMvDrawPreviewSvg,
  listBridgedHmiSymbols,
} = require('../symbolBridge');
const { buildMvDrawPdf } = require('../exportPdf');
const { buildMvDrawDxf } = require('../exportDxf');
const { buildSceneFromMvDraw } = require('../sceneFromMvDraw');
const { slugFromProject, writeMvDraw3dArtifacts } = require('../mvDrawArtifacts');
const { projectStorageInfo } = require('../mvDrawStore');
const { mirrorUpload } = require('../../../src/storage/gridfsMirror');
const gridfs = require('../../../src/storage/gridfsStore');
const {
  readPeaklogicProjectContext,
  saveMvDrawToPeaklogicProject,
  loadMvDrawFromPeaklogicProject,
  saveMvDrawToProjectLibrary,
  linkComposerTo3d,
  applyMvDrawHmiCompile,
} = require('../projectSync');
const {
  compileMvDrawToHmi,
} = require('../mvDrawToHmi');
const persistence = require('../../../src/persistence');
const {
  packMvDraw,
  resolveImportPayload,
  bundleFilename,
} = require('../../../src/project/projectBundle');
const PACKAGE_VERSION = require('../../../package.json').version;

const ALLOWED_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function projectPayload(project) {
  return { project, storage: projectStorageInfo(project) };
}

function createMvDrawRoutes() {
  const router = express.Router();

  router.get('/mv-draw/project', (req, res) => {
    res.json(projectPayload(readActiveProject()));
  });

  router.put('/mv-draw/project', (req, res) => {
    try {
      const project = writeActiveProject(req.body?.project || req.body);
      res.json({ ok: true, ...projectPayload(project) });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/mv-draw/project/new', (req, res) => {
    try {
      const project = newActiveProject(req.body || {});
      res.json({ ok: true, ...projectPayload(project) });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/mv-draw/project/save-as', (req, res) => {
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

  router.post('/mv-draw/project/open', (req, res) => {
    try {
      const file = req.body?.file;
      if (!file) return res.status(400).json({ error: 'Missing file' });
      const project = openNamedProject(file);
      res.json({ ok: true, ...projectPayload(project), file: path.basename(String(file)) });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/mv-draw/projects', (req, res) => {
    res.json({ projects: listNamedProjects() });
  });

  router.get('/mv-draw/project/bundle', (req, res) => {
    try {
      const project = readActiveProject();
      const bundle = packMvDraw(project, { exportedBy: PACKAGE_VERSION });
      const name = String(project.name || 'layout').trim() || 'layout';
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${bundleFilename(name)}"`);
      res.send(JSON.stringify(bundle, null, 2));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/mv-draw/project/import', (req, res) => {
    try {
      const resolved = resolveImportPayload(req.body);
      if (resolved.type !== 'mvdraw') {
        return res.status(400).json({ error: 'Expected an MV Draw bundle or .mvdraw.json file' });
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

  router.get('/mv-draw/project/context', (req, res) => {
    try {
      const context = readPeaklogicProjectContext();
      res.json({ ok: true, context, storage: projectStorageInfo(readActiveProject()) });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/mv-draw/project/save-to-project', async (req, res) => {
    try {
      const result = saveMvDrawToPeaklogicProject(req.body?.project || readActiveProject(), {
        linkComposer: req.body?.linkComposer !== false,
        setComposerMode: req.body?.setComposerMode !== false,
        facilityPlanUrl: req.body?.facilityPlanUrl,
      });
      let libraryId = null;
      try {
        libraryId = await saveMvDrawToProjectLibrary();
      } catch (e) {
        console.warn('[mv-draw] project library save:', e.message || e);
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

  router.post('/mv-draw/project/load-from-project', (req, res) => {
    try {
      const result = loadMvDrawFromPeaklogicProject();
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

  router.get('/mv-draw/symbols', (req, res) => {
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
        mvDrawCount: symbols.length,
        hmiBridgedCount: bridged.length,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.get('/mv-draw/symbols/:type/preview.svg', (req, res) => {
    try {
      const type = decodeURIComponent(String(req.params.type || '').trim());
      const sym = getSymbol(type);
      if (!sym) return res.status(404).send('Symbol not found');
      res.type('image/svg+xml');
      res.send(buildMvDrawPreviewSvg(sym));
    } catch (e) {
      res.status(500).send(e.message || String(e));
    }
  });

  router.post('/mv-draw/compile-hmi', (req, res) => {
    try {
      const project = normalizeMvDraw(req.body?.project || readActiveProject());
      const publicRoot = path.join(__dirname, '../../../public');
      const compiled = compileMvDrawToHmi(project, {
        screenId: req.body?.screenId,
        screenName: req.body?.screenName,
        publicRoot,
      });
      if (req.body?.apply) {
        const applied = applyMvDrawHmiCompile(project, compiled, { publicRoot });
        return res.json({ ok: true, applied: true, ...compiled, settings: applied.settings });
      }
      res.json({ ok: true, applied: false, ...compiled });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/mv-draw/background/:file', (req, res) => {
    const full = resolveUpload(req.params.file);
    if (!full) return res.status(404).json({ error: 'Background not found' });
    res.sendFile(full);
  });

  router.post('/mv-draw/background', async (req, res) => {
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
          metadata: { source: 'mv-draw-background', path: rel },
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
        url: `/api/mv-draw/background/${safe}`,
        gridfsFileId: gridfsFile?.fileId || null,
        project,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/mv-draw/export/pdf', async (req, res) => {
    try {
      const project = normalizeMvDraw(req.body?.project || readActiveProject());
      const exportOpts = { ...(req.body?.options || {}) };
      if (req.body?.orientation) exportOpts.orientation = req.body.orientation;
      const buf = await buildMvDrawPdf(project, exportOpts);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = String(project.name || 'layout').replace(/[^\w.-]+/g, '_').slice(0, 40);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="MVDraw_${name}_${stamp}.pdf"`);
      res.send(buf);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/mv-draw/export/dxf', (req, res) => {
    try {
      const project = normalizeMvDraw(req.body?.project || readActiveProject());
      const exportOpts = { ...(req.body?.options || {}) };
      if (req.body?.orientation) exportOpts.orientation = req.body.orientation;
      const dxf = buildMvDrawDxf(project, exportOpts);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = String(project.name || 'layout').replace(/[^\w.-]+/g, '_').slice(0, 40);
      res.setHeader('Content-Type', 'application/dxf');
      res.setHeader('Content-Disposition', `attachment; filename="MVDraw_${name}_${stamp}.dxf"`);
      res.send(dxf);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/mv-draw/view-3d', (req, res) => {
    try {
      const project = normalizeMvDraw(req.body?.project || readActiveProject());
      const feetPerUnit = Number.isFinite(+req.body?.feetPerUnit) && +req.body.feetPerUnit > 0
        ? +req.body.feetPerUnit
        : 1;
      const site = buildSceneFromMvDraw(project, { feetPerUnit });
      const slug = slugFromProject(project, req.body?.slug);
      const artifacts = writeMvDraw3dArtifacts(site, slug);

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

module.exports = { createMvDrawRoutes };

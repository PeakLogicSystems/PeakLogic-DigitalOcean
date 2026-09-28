'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const persistence = require('../../persistence');
const programStore = require('../../programs/programStore');
const projectStore = require('../../project/projectStore');
const { safeId: projectSafeId } = require('../../project/projectIds');
const { pack, apply, blankProjectDoc, exportFilename } = require('../../project/estFile');
const {
  packArchive,
  applyArchive,
  applyImportBuffer,
  archiveFilename,
  ZIP_EXT,
} = require('../../project/projectArchive');
const { finishProjectImport } = require('../../project/projectImport');
const projectDiskCatalog = require('../../project/projectDiskCatalog');
const { pickProjectImportFile } = require('../../project/nativeProjectPicker');
const { rememberLastOpenedProject } = require('../../project/startupLoader');
const { normalizeStartup } = require('../../settings/startupSettings');
const { isCloudDeployment } = require('../../cloud/agentProtocol');
const { getProjectTenantId } = require('../../project/projectTenantContext');
const PACKAGE_VERSION = require('../../../package.json').version;

function openDirInShell(dir) {
  if (process.platform === 'win32') {
    spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
  }
}

function createProjectRoutes(deps) {
  const { tagStore, driverManager, scanEngine, graphHistory } = deps;
  const router = require('express').Router();
  const runtimeDeps = {
    tagStore,
    driverManager,
    scanEngine,
    persistence,
    graphHistory,
  };

  router.use((req, res, next) => {
    if (!isCloudDeployment()) return next();
    if (!getProjectTenantId()) {
      return res.status(403).json({ error: 'Select an organization to access projects' });
    }
    next();
  });

  async function importProjectBuffer(buf, opts = {}) {
    const out = await applyImportBuffer(buf, runtimeDeps, {
      prunePrograms: false,
      ...opts,
    });
    persistence.writeJson('project.est.json', out);
    await persistence.flushConfig();
    return finishProjectImport(buf, runtimeDeps, out);
  }

  router.get('/project/est', (req, res) => {
    const name = String(req.query.name || 'project').trim() || 'project';
    const doc = pack({ tagStore, driverManager, persistence }, { name });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(name)}"`);
    res.send(JSON.stringify(doc, null, 2));
  });

  router.get('/project/archive', (req, res) => {
    try {
      const name = req.query.name || 'project';
      const buf = packArchive(runtimeDeps, { name, exportedBy: PACKAGE_VERSION });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${archiveFilename(name)}"`);
      res.send(buf);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/projects/export', async (req, res) => {
    try {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const listed = projectStore.listProjects().find((p) => p.id === projectSafeId(id));
      const name = listed?.name || id;
      const buf = projectStore.readProjectArchiveBuffer(id);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${archiveFilename(name)}"`);
      res.send(buf);
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/project/est', async (req, res) => {
    try {
      const doc = await apply(req.body, { tagStore, driverManager, scanEngine, persistence });
      persistence.writeJson('project.est.json', doc);
      res.json({
        ok: true,
        project: doc,
        tagCount: tagStore.count(),
        driverCount: driverManager.list().length,
        importWarnings: doc.importWarnings || [],
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/project/archive', express.raw({
    type: ['application/zip', 'application/json', 'application/octet-stream', 'application/x-zip-compressed', '*/*'],
    limit: '64mb',
  }), async (req, res) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body : null;
      if (!raw || !raw.length) {
        return res.status(400).json({ error: 'Expected a PeakLogic project file (.est.zip or .est.json)' });
      }
      const result = await importProjectBuffer(raw);
      res.json(result);
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/workspace/save', async (req, res) => {
    try {
      const meta = req.body?.project || {};
      const buf = packArchive(runtimeDeps, { ...meta, exportedBy: PACKAGE_VERSION });
      persistence.writeBinary('workspace.est.zip', buf);
      const doc = pack({ tagStore, driverManager, persistence }, meta);
      persistence.writeJson('workspace.est.json', doc);
      await persistence.flushConfig();
      if (doc.activeProgram) {
        programStore.setActive(doc.activeProgram);
        programStore.writeActive(doc.program);
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/projects', async (req, res) => {
    const projects = await projectStore.listProjectsFresh();
    res.json({
      projects,
      tenantId: getProjectTenantId(),
      projectsBackend: 'disk',
      projectsDir: projectStore.projectsDir(),
      projectsStorage: projectStore.projectsStorageLabel(),
    });
  });

  router.get('/projects/importable', (req, res) => {
    try {
      const catalog = projectDiskCatalog.listImportableProjects();
      res.json({
        ...catalog,
        projectsDir: catalog.projectsDir || projectStore.projectsDir(),
        projectsStorage: projectStore.projectsStorageLabel(),
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/projects/import/library', async (req, res) => {
    try {
      const { buffer } = projectDiskCatalog.readImportableFile(req.body?.file);
      const result = await importProjectBuffer(buffer);
      res.json(result);
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/projects/import/path', async (req, res) => {
    try {
      const { buffer, file } = projectDiskCatalog.readImportablePath(req.body?.path);
      const result = await importProjectBuffer(buffer);
      res.json({ ...result, file });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/projects/import/native-pick', async (req, res) => {
    try {
      const picked = pickProjectImportFile(projectStore.projectsDir());
      if (!picked) {
        return res.json({ ok: false, cancelled: true });
      }
      const { buffer, file } = projectDiskCatalog.readImportablePath(picked);
      const result = await importProjectBuffer(buffer);
      res.json({
        ok: true,
        cancelled: false,
        path: picked,
        file,
        ...result,
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/projects/import/file', async (req, res) => {
    try {
      const filename = String(req.body?.filename || 'project.est.zip').trim() || 'project.est.zip';
      const b64 = String(req.body?.contentBase64 || '').trim();
      if (!b64) return res.status(400).json({ error: 'Missing contentBase64' });
      const buffer = Buffer.from(b64, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'Empty project file' });
      const result = await importProjectBuffer(buffer);
      res.json({ ...result, filename });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/projects/open-folder', (req, res) => {
    const dir = projectStore.projectsDir();
    try {
      openDirInShell(dir);
      res.json({
        ok: true,
        projectsDir: dir,
        projectsBackend: 'disk',
        projectsStorage: projectStore.projectsStorageLabel(),
      });
    } catch (e) {
      res.status(500).json({
        error: e.message || 'Could not open folder',
        projectsDir: dir,
        projectsBackend: 'disk',
      });
    }
  });

  router.post('/projects/save', async (req, res) => {
    try {
      const name = String(req.body?.name || req.body?.project?.name || 'project').trim() || 'project';
      const buf = packArchive(runtimeDeps, { name, exportedBy: PACKAGE_VERSION });
      const saved = projectStore.saveProjectArchive(name, buf);
      const settings = persistence.readJson('settings.json', {});
      settings.project = { ...(settings.project || {}), name };
      persistence.writeJson('settings.json', settings);
      await persistence.flushConfig();
      await rememberLastOpenedProject(saved.id, name);
      const projects = await projectStore.listProjectsFresh();
      console.log(`[project] saved "${saved.id}" → ${saved.path} (${projects.length} in library)`);
      res.json({ ok: true, id: saved.id, projectName: name, projects });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/projects/new', async (req, res) => {
    try {
      const name = String(req.body?.name || 'untitled').trim() || 'untitled';
      const doc = blankProjectDoc(name);
      const out = await apply(
        doc,
        { tagStore, driverManager, scanEngine, persistence, graphHistory },
        { prunePrograms: true, reset: true },
      );
      persistence.writeJson('workspace.est.json', out);
      persistence.writeJson('project.est.json', out);
      await persistence.flushConfig();
      res.json({
        ok: true,
        project: out.project,
        tagCount: tagStore.count(),
        driverCount: driverManager.list().length,
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/projects/open', async (req, res) => {
    try {
      const id = req.body?.id;
      const sid = projectSafeId(id);
      let out;
      const zipFp = path.join(projectStore.projectsDir(), `${sid}${ZIP_EXT}`);
      if (fs.existsSync(zipFp)) {
        const unpacked = projectStore.loadProjectArchive(sid);
        out = await applyArchive(unpacked, runtimeDeps, { lastOpenedProjectId: sid });
      } else {
        const doc = projectStore.loadProjectDoc(sid);
        out = await apply(doc, runtimeDeps, { lastOpenedProjectId: sid });
      }
      const projectName = String(out.project?.name || id).trim() || id;
      await rememberLastOpenedProject(sid, projectName);
      res.json({
        ok: true,
        project: out.project,
        projectName,
        tagCount: tagStore.count(),
        driverCount: driverManager.list().length,
        importWarnings: out.importWarnings || [],
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.delete('/projects', async (req, res) => {
    try {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const safeId = projectSafeId(id);
      const settings = persistence.readJson('settings.json', {});
      const startup = normalizeStartup(settings.startup);
      if (startup.mode === 'saved_project' && projectSafeId(startup.projectId) === safeId) {
        return res.status(400).json({
          error: 'Cannot delete the startup project. Open System setup → General and choose a different startup project first.',
        });
      }
      projectStore.loadProjectDoc(safeId);
      projectStore.deleteProjectDoc(safeId);
      if (projectSafeId(settings.project?.lastOpenedId) === safeId) {
        settings.project = { ...(settings.project || {}), lastOpenedId: null };
        persistence.writeJson('settings.json', settings);
        await persistence.flushConfig();
      }
      res.json({ ok: true, projects: await projectStore.listProjectsFresh() });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/config/import', async (req, res) => {
    try {
      const doc = await apply(req.body, { tagStore, driverManager, scanEngine, persistence });
      res.json({
        ok: true,
        tagCount: tagStore.count(),
        project: doc.project,
        importWarnings: doc.importWarnings || [],
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createProjectRoutes };

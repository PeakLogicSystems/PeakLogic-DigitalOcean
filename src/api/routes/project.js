'use strict';

const persistence = require('../../persistence');
const programStore = require('../../programs/programStore');
const projectStore = require('../../project/projectStore');
const { pack, apply, blankProjectDoc } = require('../../project/estFile');

function createProjectRoutes(deps) {
  const { tagStore, driverManager, scanEngine } = deps;
  const router = require('express').Router();

  router.get('/project/est', (req, res) => {
    const doc = pack({ tagStore, driverManager, persistence }, { name: req.query.name || 'project' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="project.est"');
    res.send(JSON.stringify(doc, null, 2));
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
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/workspace/save', async (req, res) => {
    const doc = pack({ tagStore, driverManager, persistence }, req.body?.project || {});
    persistence.writeJson('workspace.est.json', doc);
    programStore.writeActive(doc.program);
    if (doc.activeProgram) programStore.setActive(doc.activeProgram);
    res.json({ ok: true });
  });

  router.get('/projects', (req, res) => {
    res.json({ projects: projectStore.listProjects() });
  });

  router.post('/projects/save', (req, res) => {
    const name = req.body?.name || req.body?.project?.name || 'project';
    const doc = pack({ tagStore, driverManager, persistence }, { name });
    const saved = projectStore.saveProjectDoc(name, doc);
    res.json({ ok: true, id: saved.id, projects: projectStore.listProjects() });
  });

  router.post('/projects/new', async (req, res) => {
    try {
      const name = String(req.body?.name || 'untitled').trim() || 'untitled';
      const doc = blankProjectDoc(name);
      const out = await apply(doc, { tagStore, driverManager, scanEngine, persistence });
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
      const doc = projectStore.loadProjectDoc(id);
      const out = await apply(doc, { tagStore, driverManager, scanEngine, persistence });
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

  router.delete('/projects', (req, res) => {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    projectStore.deleteProjectDoc(id);
    res.json({ ok: true, projects: projectStore.listProjects() });
  });

  router.post('/config/import', async (req, res) => {
    try {
      const doc = await apply(req.body, { tagStore, driverManager, scanEngine, persistence });
      res.json({ ok: true, tagCount: tagStore.count(), project: doc.project });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createProjectRoutes };

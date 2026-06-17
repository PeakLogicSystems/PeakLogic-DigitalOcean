'use strict';

const { spawn } = require('child_process');
const programStore = require('../../programs/programStore');
const { loadFixtureBundle } = require('../../programs/programFixtures');
const { parseProgram, collectProgramTagRefs } = require('../../engine/parser');

function createProgramRoutes(deps) {
  const { tagStore, driverManager, scanEngine } = deps;
  const router = require('express').Router();

  router.get('/programs', (req, res) => {
    res.json({
      programs: programStore.listPrograms(),
      active: programStore.activeRel(),
      stDir: programStore.ST_DIR,
    });
  });

  router.get('/programs/root', (req, res) => {
    res.json({
      stDir: programStore.ST_DIR,
      active: programStore.activeRel(),
      programs: programStore.listPrograms(),
    });
  });

  router.post('/programs/open-folder', (req, res) => {
    const dir = programStore.ST_DIR;
    try {
      if (process.platform === 'win32') {
        spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'darwin') {
        spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
      }
      res.json({ ok: true, stDir: dir });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Could not open folder', stDir: dir });
    }
  });

  router.get('/program/file', (req, res) => {
    const rel = programStore.sanitizeRel(req.query.path || programStore.activeRel());
    res.json({ path: rel, source: programStore.readProgram(rel) });
  });

  router.post('/programs/load', async (req, res) => {
    try {
      const rel = programStore.sanitizeRel(req.body?.path || programStore.DEFAULT_PROGRAM);
      if (!programStore.programExists(rel)) {
        return res.status(404).json({ error: `Program not found: ${rel}`, path: rel });
      }
      let fixturesLoaded = null;
      if (req.body?.loadFixtures === true) {
        const bundle = loadFixtureBundle(rel, driverManager.list());
        if (bundle) {
          tagStore.replaceAll(bundle.tags);
          driverManager.save(bundle.drivers);
          await driverManager.rebuild();
          fixturesLoaded = {
            tagsFile: bundle.tagsFile,
            driversFile: bundle.driversFile,
            tagCount: bundle.tags.length,
          };
        }
      }
      programStore.setActive(rel);
      const r = scanEngine.loadProgram();
      res.json({
        ok: r.ok,
        active: rel,
        errors: r.errors,
        source: programStore.readActive(),
        stDir: programStore.ST_DIR,
        fixturesLoaded,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Load failed' });
    }
  });

  router.post('/programs/load-fixtures', async (req, res) => {
    try {
      const rel = programStore.sanitizeRel(req.body?.path || programStore.activeRel());
      const bundle = loadFixtureBundle(rel, driverManager.list());
      if (!bundle) {
        return res.status(404).json({
          error: `No fixture bundle for program ${rel}. Use Open project or Drivers → Apply device template.`,
        });
      }
      tagStore.replaceAll(bundle.tags);
      driverManager.save(bundle.drivers);
      await driverManager.rebuild();
      const r = scanEngine.loadProgram();
      res.json({
        ok: true,
        active: rel,
        fixturesLoaded: {
          tagsFile: bundle.tagsFile,
          driversFile: bundle.driversFile,
          tagCount: bundle.tags.length,
        },
        programOk: r.ok,
        errors: r.errors,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Load fixtures failed' });
    }
  });

  router.put('/program', (req, res) => {
    programStore.writeActive(req.body.source || '');
    const r = scanEngine.loadProgram();
    const active = programStore.activeRel();
    res.json({
      ok: true,
      programOk: r.ok,
      errors: r.errors,
      active,
      source: programStore.readActive(),
    });
  });

  router.post('/programs/save', (req, res) => {
    try {
      const rel = programStore.saveToPath(
        req.body?.path || programStore.activeRel(),
        req.body?.source ?? '',
        req.body?.setActive !== false
      );
      const r = scanEngine.loadProgram();
      res.json({
        ok: true,
        active: rel,
        stDir: programStore.ST_DIR,
        filePath: programStore.resolvePath(rel),
        programOk: r.ok,
        errors: r.errors,
        source: programStore.readProgram(rel),
      });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Save failed' });
    }
  });

  router.post('/programs/import', (req, res) => {
    try {
      const rel = programStore.saveToPath(
        req.body?.path || programStore.suggestRelFromFilename('program.st'),
        req.body?.source ?? '',
        true
      );
      const r = scanEngine.loadProgram();
      res.json({
        ok: r.ok,
        active: rel,
        stDir: programStore.ST_DIR,
        filePath: programStore.resolvePath(rel),
        errors: r.errors,
        source: programStore.readProgram(rel),
      });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Import failed' });
    }
  });

  router.post('/program/validate', (req, res) => {
    const src = req.body.source ?? programStore.readActive();
    const r = scanEngine.validate(src);
    const { ast } = parseProgram(src);
    res.json({ ...r, programTags: ast ? collectProgramTagRefs(ast) : [] });
  });

  return router;
}

module.exports = { createProgramRoutes };

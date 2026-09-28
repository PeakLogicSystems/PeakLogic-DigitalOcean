'use strict';

const { spawn } = require('child_process');
const programStore = require('../../programs/programStore');
const persistence = require('../../persistence');
const { loadFixtureBundle } = require('../../programs/programFixtures');
const { ensureMotorTags, isMotorProgramPath } = require('../../programs/motorTags');
const { parseProgram, collectProgramTagRefs } = require('../../engine/parser');
const { createContext, collectExpressionTrace } = require('../../engine/executor');
const { estimateOptaDeploy } = require('../../parc/mqttOptaProgram');
const { OPTA_PROGRAM_MAX_BYTES, clientDeployMeta } = require('../../drivers/optaProtocol');
const {
  assessStProgramLines,
  stProgramLimitsMeta,
} = require('../../programs/stProgramLimits');

function unknownTagsFromErrors(errors) {
  return [...new Set((errors || [])
    .filter((x) => /^Unknown tag:/i.test(String(x)))
    .map((x) => String(x).replace(/^Unknown tag:\s*/i, '').trim())
    .filter(Boolean))];
}

function findRemoteOptaDriverId(driverManager) {
  const cfg = driverManager.list().find(
    (d) => (d.type === 'opta_remote' || d.type === 'mqtt_parc') && d.enabled !== false,
  );
  return cfg?.id || null;
}

function optaProgramLimitBytes(driverManager, driverId) {
  const id = driverId || findRemoteOptaDriverId(driverManager);
  if (!id) return OPTA_PROGRAM_MAX_BYTES;
  const inst = driverManager.instances.get(id);
  const fromDevice = Number(inst?._deviceStatus?.programMaxBytes);
  return fromDevice > 0 ? fromDevice : OPTA_PROGRAM_MAX_BYTES;
}

function createProgramRoutes(deps) {
  const { tagStore, driverManager, scanEngine } = deps;
  const router = require('express').Router();

  router.get('/programs', (req, res) => {
    res.json({
      programs: programStore.listPrograms(),
      active: programStore.activeRel(),
      stDir: programStore.stDir(),
      programLimits: stProgramLimitsMeta(),
    });
  });

  router.get('/programs/root', (req, res) => {
    res.json({
      stDir: programStore.stDir(),
      active: programStore.activeRel(),
      programs: programStore.listPrograms(),
    });
  });

  router.post('/programs/open-folder', (req, res) => {
    const dir = programStore.stDir();
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

  router.post('/programs/reload', (req, res) => {
    try {
      const rel = programStore.sanitizeRel(req.body?.path || programStore.activeRel());
      if (!rel) {
        return res.status(400).json({ error: 'No active program — pick one from Library or Open from st/.' });
      }
      if (!programStore.programExists(rel)) {
        return res.status(404).json({ error: `Program not found: ${rel}`, path: rel });
      }
      programStore.setActive(rel);
      const r = scanEngine.loadProgram();
      res.json({
        ok: r.ok,
        active: rel,
        errors: r.errors,
        source: programStore.readProgram(rel),
        stDir: programStore.stDir(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Reload failed' });
    }
  });

  router.post('/programs/clear', async (req, res) => {
    try {
      if (scanEngine.running) await scanEngine.stop();
      programStore.clearActive();
      scanEngine.ast = null;
      scanEngine.errors = [];
      scanEngine._programTrace = [];
      res.json({
        ok: true,
        active: '',
        errors: [],
        source: '',
        stDir: programStore.stDir(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Clear failed' });
    }
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
        stDir: programStore.stDir(),
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
      programStore.setActive(rel);
      const r = scanEngine.loadProgram();
      res.json({
        ok: true,
        active: rel,
        source: programStore.readProgram(rel),
        stDir: programStore.stDir(),
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
    const errors = r.errors || [];
    res.json({
      ok: true,
      programOk: r.ok,
      errors,
      unknownTags: unknownTagsFromErrors(errors),
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
        stDir: programStore.stDir(),
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
        stDir: programStore.stDir(),
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
    const remoteOn = persistence.readJson('settings.json', {}).remoteExecution === true;
    const localLines = assessStProgramLines(src, { forParc: false });
    const parcLines = assessStProgramLines(src, { forParc: true });
    const r = scanEngine.validate(src);
    const { ast } = parseProgram(src);
    const errors = [...(r.errors || [])];
    if (remoteOn) {
      for (const e of parcLines.errors || []) {
        if (!errors.includes(e)) errors.push(e);
      }
    }
    res.json({
      ok: errors.length === 0,
      errors,
      unknownTags: unknownTagsFromErrors(errors),
      programTags: ast ? collectProgramTagRefs(ast) : [],
      lineCount: {
        lines: localLines.lines,
        local: localLines,
        parc: parcLines,
      },
      programLimits: stProgramLimitsMeta(),
    });
  });

  router.post('/program/trace', (req, res) => {
    const src = req.body.source ?? programStore.readActive();
    const r = scanEngine.validate(src);
    if (!r.ok) {
      return res.json({ ok: false, errors: r.errors || [], trace: [] });
    }
    const { ast } = parseProgram(src);
    if (!ast) {
      return res.json({ ok: false, errors: ['Program parse failed'], trace: [] });
    }
    const trace = collectExpressionTrace(ast, createContext(tagStore, new Set()));
    res.json({ ok: true, errors: [], trace });
  });

  router.post('/program/deploy-estimate', (req, res) => {
    const src = req.body.source ?? programStore.readActive();
    const settings = persistence.readJson('settings.json', {});
    const driverId = req.body.driverId || findRemoteOptaDriverId(driverManager);
    const remoteApplicable = settings.remoteExecution === true && !!driverId;
    if (!remoteApplicable) {
      return res.json({
        ok: true,
        remoteApplicable: false,
        bytes: 0,
        astBytes: 0,
        tagCount: 0,
        limit: OPTA_PROGRAM_MAX_BYTES,
        overLimit: false,
        headroom: OPTA_PROGRAM_MAX_BYTES,
        pct: 0,
      });
    }
    const limit = optaProgramLimitBytes(driverManager, driverId);
    const est = estimateOptaDeploy(src, tagStore, driverId, {
      limitBytes: limit,
      programName: programStore.activeRel() || '',
    });
    if (!est.ok) {
      const errors = est.errors || ['Program invalid'];
      return res.json({
        ok: false,
        remoteApplicable: true,
        errors,
        error: errors.join('; '),
        limit,
        lineCount: assessStProgramLines(src, { forParc: true }),
        programLimits: stProgramLimitsMeta(),
      });
    }
    res.json({
      ...est,
      remoteApplicable: true,
      driverId,
      lineCount: assessStProgramLines(src, { forParc: true }),
      programLimits: stProgramLimitsMeta(),
    });
  });

  return router;
}

module.exports = { createProgramRoutes };

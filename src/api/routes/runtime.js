'use strict';

const programStore = require('../../programs/programStore');

function createRuntimeRoutes(deps) {
  const { tagStore, driverManager, scanEngine } = deps;
  const router = require('express').Router();

  router.post('/runtime/start', async (req, res) => {
    try {
      await scanEngine.start();
      res.json(scanEngine.status());
    } catch (e) {
      const errs = e.errors || scanEngine.errors || [];
      const unknown = errs.filter((x) => /^Unknown tag:/i.test(x)).map((x) => x.replace(/^Unknown tag:\s*/i, ''));
      const have = tagStore.list().map((t) => t.id);
      let hint = '';
      if (unknown.length) {
        hint = ` Program uses ${unknown.join(', ')} but tag table has: ${have.join(', ') || '(none)'}.`
          + ' Click Load selected (loads matching st/fixtures), Apply Waveshare device template, or Open project.';
      }
      const msg = errs.length
        ? `Program invalid: ${errs.join('; ')}.${hint}`
        : (e.message || 'Start failed');
      res.status(400).json({
        error: msg,
        errors: errs,
        unknownTags: unknown,
        tagIds: have,
        activeProgram: programStore.activeRel(),
        runtime: scanEngine.status(),
        driverHealth: driverManager.health(),
        stDir: programStore.ST_DIR,
      });
    }
  });

  router.post('/runtime/pause', (req, res) => {
    scanEngine.pause();
    res.json(scanEngine.status());
  });

  router.post('/runtime/resume', (req, res) => {
    scanEngine.resume();
    res.json(scanEngine.status());
  });

  router.post('/runtime/stop', async (req, res) => {
    await scanEngine.stop();
    res.json(scanEngine.status());
  });

  return router;
}

module.exports = { createRuntimeRoutes };

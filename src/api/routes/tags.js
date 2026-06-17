'use strict';

const { MAX_TAGS } = require('../../config');

function createTagRoutes(deps) {
  const { tagStore } = deps;
  const router = require('express').Router();

  router.get('/tags', (req, res) => {
    res.json({ tags: tagStore.list(), count: tagStore.count(), max: MAX_TAGS });
  });

  router.put('/tags', (req, res) => {
    tagStore.replaceAll(req.body.tags || []);
    res.json({ ok: true, count: tagStore.count() });
  });

  return router;
}

module.exports = { createTagRoutes };

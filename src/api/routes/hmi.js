'use strict';

const path = require('path');
const { listHmiAssets } = require('../../hmi/hmiConfig');

const PUBLIC_ROOT = path.join(__dirname, '../../../public');

function createHmiRoutes() {
  const router = require('express').Router();

  router.get('/hmi/assets', (req, res) => {
    try {
      const assets = listHmiAssets(PUBLIC_ROOT);
      res.json({ assets, count: assets.length });
    } catch (err) {
      res.status(500).json({ assets: [], count: 0, error: String(err?.message || err) });
    }
  });

  return router;
}

module.exports = { createHmiRoutes };

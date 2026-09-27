'use strict';

const express = require('express');

function createPageRoutes({ appVersion }) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.render('dashboard', { title: 'PeakLogic', assetV: appVersion });
  });
  return router;
}

module.exports = { createPageRoutes };

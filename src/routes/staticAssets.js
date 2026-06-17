'use strict';

const path = require('path');
const fs = require('fs');
const { resolveAssetPath } = require('../hmi/hmiConfig');

/** Redirect legacy HMI asset paths after library reorganize */
function createHmiAssetRedirect(publicRoot) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!req.path.startsWith('/hmi/svg/')) return next();
    const abs = path.join(publicRoot, req.path.replace(/^\//, ''));
    if (fs.existsSync(abs)) return next();
    const mapped = resolveAssetPath(publicRoot, req.path);
    if (mapped && mapped !== req.path) return res.redirect(301, mapped);
    return next();
  };
}

module.exports = { createHmiAssetRedirect };

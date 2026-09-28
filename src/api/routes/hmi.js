'use strict';

const fs = require('fs');
const path = require('path');
const { listHmiAssets, resolveAssetPath } = require('../../hmi/hmiConfig');
const { saveUserHmiAsset, userImportsDir } = require('../../hmi/hmiUserAssets');
const { DATA_DIR } = require('../../config');

const PUBLIC_ROOT = path.join(__dirname, '../../../public');

function createHmiRoutes(deps = {}) {
  const router = require('express').Router();
  const dataDir = deps.dataDir || DATA_DIR;

  router.get('/hmi/assets', (req, res) => {
    try {
      const assets = listHmiAssets(PUBLIC_ROOT, dataDir);
      res.json({ assets, count: assets.length });
    } catch (err) {
      res.status(500).json({ assets: [], count: 0, error: String(err?.message || err) });
    }
  });

  router.post('/hmi/assets/import', (req, res) => {
    try {
      const filename = String(req.body?.filename || req.body?.name || '').trim();
      const b64 = String(req.body?.contentBase64 || '').trim();
      if (!filename || !b64) {
        return res.status(400).json({ error: 'filename and contentBase64 required' });
      }
      const buffer = Buffer.from(b64, 'base64');
      const saved = saveUserHmiAsset(dataDir, filename, buffer);
      if (!saved.ok) return res.status(400).json({ error: saved.error });
      res.json({ ok: true, asset: saved.asset, path: saved.path });
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  router.get('/hmi/user-assets', (req, res) => {
    try {
      const dir = userImportsDir(dataDir);
      const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      res.json({ dir, files });
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  router.get('/hmi/resolve', (req, res) => {
    const raw = String(req.query?.path || '').trim();
    if (!raw) return res.status(400).json({ error: 'Missing path' });
    const resolved = resolveAssetPath(PUBLIC_ROOT, raw);
    const userPath = raw.startsWith('/hmi/user/');
    const abs = userPath
      ? path.join(userImportsDir(dataDir), decodeURIComponent(raw.slice('/hmi/user/'.length)))
      : path.join(PUBLIC_ROOT, resolved.replace(/^\//, ''));
    res.json({
      path: resolved,
      ok: fs.existsSync(abs),
    });
  });

  return router;
}

module.exports = { createHmiRoutes };

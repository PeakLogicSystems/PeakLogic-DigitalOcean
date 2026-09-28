'use strict';

const gridfs = require('../../storage/gridfsStore');

function createStorageRoutes() {
  const router = require('express').Router();

  router.get('/storage/gridfs/status', async (req, res) => {
    try {
      res.json({ status: await gridfs.status() });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.get('/storage/gridfs/:bucket/:fileId', async (req, res) => {
    const bucket = String(req.params.bucket || '').trim();
    const fileId = String(req.params.fileId || '').trim();
    if (!bucket || !fileId) return res.status(400).json({ error: 'bucket and fileId required' });
    try {
      const stream = await gridfs.openDownloadStream(bucket, fileId);
      stream.on('file', (file) => {
        if (file?.contentType) res.setHeader('Content-Type', file.contentType);
        if (file?.filename) {
          res.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/"/g, '')}"`);
        }
      });
      stream.on('error', (err) => {
        if (!res.headersSent) res.status(404).json({ error: err.message });
        else res.end();
      });
      stream.pipe(res);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/storage/gridfs/:bucket', async (req, res) => {
    const bucket = String(req.params.bucket || '').trim();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const cameraId = req.query.cameraId ? String(req.query.cameraId) : null;
    try {
      const query = cameraId ? { 'metadata.cameraId': cameraId } : {};
      const files = await gridfs.listSummaries(bucket, query, { limit });
      res.json({ bucket, files });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createStorageRoutes };

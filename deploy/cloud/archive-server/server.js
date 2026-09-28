#!/usr/bin/env node
'use strict';

/**
 * PeakLogic archive server (cloud 2) — zstd blob store only.
 *
 *   ARCHIVE_ROOT=/data/archive ARCHIVE_SERVER_TOKEN=secret PORT=8090 node server.js
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.PORT) || 8090;
const ROOT = path.resolve(process.env.ARCHIVE_ROOT || '/data/archive');
const TOKEN = String(process.env.ARCHIVE_SERVER_TOKEN || '').trim();

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function authOk(req) {
  if (!TOKEN) return true;
  const h = req.headers.authorization || '';
  return h === `Bearer ${TOKEN}`;
}

function safeRelativePath(urlPath) {
  const raw = decodeURIComponent(String(urlPath || '').replace(/^\/archive\/?/, ''));
  const normalized = path.normalize(raw).replace(/^(\.\.(\/|\\|$))+/, '');
  if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

function fullPath(rel) {
  const fp = path.join(ROOT, rel);
  if (!fp.startsWith(ROOT)) return null;
  return fp;
}

async function ensureDirFor(filePath) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      sendJson(res, 200, { ok: true, root: ROOT });
      return;
    }

    if (!req.url.startsWith('/archive/')) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    if (!authOk(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    const rel = safeRelativePath(req.url.split('?')[0]);
    if (!rel) {
      sendJson(res, 400, { error: 'invalid path' });
      return;
    }

    const fp = fullPath(rel);
    if (!fp) {
      sendJson(res, 400, { error: 'invalid path' });
      return;
    }

    if (req.method === 'PUT') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const expected = String(req.headers['x-sha256'] || '').toLowerCase();
      const actual = sha256Buffer(body);
      if (expected && expected !== actual) {
        sendJson(res, 400, { error: 'sha256 mismatch', expected, actual });
        return;
      }
      await ensureDirFor(fp);
      await fs.promises.writeFile(fp, body);
      res.writeHead(201, {
        'Content-Type': 'application/json',
        'X-SHA256': actual,
        'Content-Length': String(body.length),
      });
      res.end(JSON.stringify({ ok: true, path: rel, bytes: body.length, sha256: actual }));
      return;
    }

    if (req.method === 'HEAD' || req.method === 'GET') {
      let stat;
      try {
        stat = await fs.promises.stat(fp);
      } catch {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      if (!stat.isFile()) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }

      const buf = await fs.promises.readFile(fp);
      const digest = sha256Buffer(buf);
      const range = req.headers.range;

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': String(buf.length),
          'X-SHA256': digest,
          'Accept-Ranges': 'bytes',
        });
        res.end();
        return;
      }

      if (range && /^bytes=\d+-\d*$/.test(range)) {
        const m = range.match(/^bytes=(\d+)-(\d*)$/);
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : buf.length - 1;
        const slice = buf.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${buf.length}`,
          'Content-Length': String(slice.length),
          'X-SHA256': digest,
          'Accept-Ranges': 'bytes',
        });
        res.end(slice);
        return;
      }

      res.writeHead(200, {
        'Content-Length': String(buf.length),
        'X-SHA256': digest,
        'Accept-Ranges': 'bytes',
      });
      res.end(buf);
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
  } catch (e) {
    sendJson(res, 500, { error: e.message || String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`[archive-server] listening :${PORT} root=${ROOT}`);
});

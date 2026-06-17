'use strict';

const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, AUTH_TOKEN } = require('../config');

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(data);
}

function sendText(res, status, text, type = 'text/plain') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function checkAuth(req) {
  if (!AUTH_TOKEN) return true;
  const h = req.headers.authorization || '';
  return h === `Bearer ${AUTH_TOKEN}`;
}

function serveStatic(urlPath, res) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const fp = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ''));
  if (!fp.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'Forbidden');
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    return sendText(res, 404, 'Not found');
  }
  const ext = path.extname(fp);
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
}

function createRouter(handlers) {
  return async function route(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      if (!checkAuth(req)) return sendJson(res, 401, { error: 'Unauthorized' });
      try {
        const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : null;
        for (const h of handlers) {
          const hit = await h(req, res, { pathname, url, body, sendJson, sendText });
          if (hit) return;
        }
        return sendJson(res, 404, { error: 'Not found' });
      } catch (e) {
        const status = e.status || 500;
        return sendJson(res, status, { error: e.message, details: e.errors });
      }
    }

    if (pathname.startsWith('/public/') || !pathname.startsWith('/api')) {
      return serveStatic(pathname.startsWith('/public/') ? pathname.slice(7) : pathname, res);
    }

    sendText(res, 404, 'Not found');
  };
}

module.exports = { createRouter, sendJson, sendText, readBody };

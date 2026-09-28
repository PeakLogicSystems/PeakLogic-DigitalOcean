'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { ROOT } = require('../../config');

function cursorCandidates() {
  const home = process.env.LOCALAPPDATA || '';
  const list = [];
  if (process.platform === 'win32' && home) {
    list.push(
      path.join(home, 'Programs', 'cursor', 'Cursor.exe'),
      path.join(home, 'Programs', 'Cursor', 'Cursor.exe'),
      path.join(home, 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
      path.join(home, 'Programs', 'Cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
    );
  }
  return list;
}

function resolveCursorBinary() {
  for (const p of cursorCandidates()) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function whichCursor() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFile(cmd, ['cursor'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const first = String(stdout || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      resolve(first || null);
    });
  });
}

async function detectCursor() {
  const local = resolveCursorBinary();
  if (local) return { available: true, path: local };
  const onPath = await whichCursor();
  if (onPath) return { available: true, path: onPath };
  return { available: false, path: null };
}

function openInCursor(targetDir) {
  return detectCursor().then((info) => {
    if (!info.available) {
      const err = new Error(
        'Cursor CLI/app not found. Install Cursor and ensure `cursor` is on PATH, or install to the default Windows location under LocalAppData\\Programs\\cursor.',
      );
      err.status = 503;
      err.code = 'CURSOR_NOT_FOUND';
      throw err;
    }
    const bin = info.path;
    const args = [targetDir];
    const child = spawn(bin, args, {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32' && /\.cmd$/i.test(bin),
      windowsHide: true,
    });
    child.unref();
    return { ok: true, path: bin, root: targetDir };
  });
}

function createDeveloperRoutes() {
  const router = require('express').Router();

  router.get('/developer/status', async (req, res) => {
    const cursor = await detectCursor();
    res.json({
      developerModeSupported: true,
      companion: 'cursor+github',
      root: ROOT,
      cursorAvailable: cursor.available,
      cursorPath: cursor.path,
    });
  });

  router.post('/developer/open-cursor', async (req, res) => {
    try {
      const result = await openInCursor(ROOT);
      res.json(result);
    } catch (e) {
      res.status(e.status || 500).json({
        error: e.message || String(e),
        code: e.code || undefined,
        root: ROOT,
      });
    }
  });

  return router;
}

module.exports = { createDeveloperRoutes, detectCursor, openInCursor };
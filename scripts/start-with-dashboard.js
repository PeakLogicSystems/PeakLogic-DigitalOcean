#!/usr/bin/env node
'use strict';

/**
 * Start PeakLogic and open the dashboard after /health responds.
 * Used by portable install launchers so the browser does not hit a dead port
 * or another process already bound to 3090.
 */

const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const port = Number(process.env.PORT || process.env.PEAKLOGIC_PORT || 3090);
const openUrl = process.env.PEAKLOGIC_OPEN_URL || `http://127.0.0.1:${port}/`;

const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

let opened = false;

function openDashboard() {
  if (opened) return;
  opened = true;
  if (process.platform === 'win32') {
    exec(`start "" "${openUrl}"`, { windowsHide: true });
    return;
  }
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} "${openUrl}"`);
}

function waitForHealth(tries = 0) {
  if (tries > 120) {
    console.warn('[start] timed out waiting for /health — open the dashboard manually:', openUrl);
    return;
  }
  const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
    res.resume();
    if (res.statusCode === 200) openDashboard();
    else setTimeout(() => waitForHealth(tries + 1), 500);
  });
  req.on('error', () => setTimeout(() => waitForHealth(tries + 1), 500));
  req.setTimeout(1500, () => {
    req.destroy();
    setTimeout(() => waitForHealth(tries + 1), 500);
  });
}

setTimeout(() => waitForHealth(0), 400);

server.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code || 0);
});

process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { DATA_DIR } = require('../config');
const {
  findGo2rtcExe,
  defaultConfigPath,
  defaultPidPath,
  DEFAULT_PORT,
} = require('../../scripts/go2rtc-paths');
const {
  ping,
  putStream,
  deleteStream,
  streamNameForCamera,
} = require('./go2rtcClient');
const {
  checkRtspReachability,
  unreachableError,
} = require('./cameraReachability');

let child = null;

function settingsPort(settings) {
  return Number(settings?.go2rtcPort) || DEFAULT_PORT;
}

function settingsHost() {
  return '127.0.0.1';
}

function buildConfigYaml(port) {
  return [
    '# PeakLogic go2rtc — auto-generated; streams added via API',
    'api:',
    `  listen: "127.0.0.1:${port}"`,
    '  origin: "*"',
    'rtsp:',
    '  listen: ":8554"',
    'webrtc:',
    '  listen: ":8555"',
    '',
  ].join('\n');
}

function ensureConfigFile(port, dataDir = DATA_DIR) {
  const configPath = defaultConfigPath(dataDir);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const next = buildConfigYaml(port);
  if (!fs.existsSync(configPath) || fs.readFileSync(configPath, 'utf8') !== next) {
    fs.writeFileSync(configPath, next, 'utf8');
  }
  return configPath;
}

function readPidFile(dataDir = DATA_DIR) {
  try {
    const pid = Number(fs.readFileSync(defaultPidPath(dataDir), 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writePidFile(pid, dataDir = DATA_DIR) {
  fs.writeFileSync(defaultPidPath(dataDir), String(pid), 'utf8');
}

function removePidFile(dataDir = DATA_DIR) {
  try {
    fs.unlinkSync(defaultPidPath(dataDir));
  } catch { /* ignore */ }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isRunning(settings = {}) {
  return ping(settingsPort(settings), settingsHost());
}

async function start(settings = {}) {
  const port = settingsPort(settings);
  if (await isRunning(settings)) {
    return { ok: true, alreadyRunning: true, port };
  }

  const exe = findGo2rtcExe();
  if (!exe) {
    throw Object.assign(new Error('go2rtc binary not found — run npm run go2rtc:download'), { code: 'ENOENT' });
  }

  const configPath = ensureConfigFile(port);
  child = spawn(exe, ['-config', configPath], {
    cwd: path.dirname(exe),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout?.on('data', (buf) => {
    const line = buf.toString().trim();
    if (line) console.log('[go2rtc]', line);
  });
  child.stderr?.on('data', (buf) => {
    const line = buf.toString().trim();
    if (line) console.warn('[go2rtc]', line);
  });
  child.on('exit', (code) => {
    if (child) console.log(`[go2rtc] exited (${code})`);
    child = null;
    removePidFile();
  });

  if (child.pid) writePidFile(child.pid);

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await isRunning(settings)) {
      console.log(`[go2rtc] listening on 127.0.0.1:${port}`);
      return { ok: true, port, pid: child.pid, exe };
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error('go2rtc failed to start within 8s');
}

async function stop(dataDir = DATA_DIR) {
  const pid = readPidFile(dataDir);
  if (pid && isProcessAlive(pid)) {
    try {
      process.kill(pid);
    } catch { /* ignore */ }
  }
  if (child?.pid) {
    try {
      child.kill();
    } catch { /* ignore */ }
  }
  child = null;
  removePidFile(dataDir);
  return { ok: true };
}

async function ensureRunning(settings = {}) {
  if (await isRunning(settings)) return { ok: true, alreadyRunning: true };
  return start(settings);
}

async function syncCamera(cameraId, rtspUrl, settings = {}, camera = {}) {
  const name = streamNameForCamera(cameraId);
  const src = String(rtspUrl || '').trim();
  if (!name || !src) {
    throw Object.assign(new Error('cameraId and rtspUrl required for go2rtc sync'), { status: 400 });
  }

  const reach = await checkRtspReachability(src, camera, settings);
  if (!reach.ok) {
    await ensureRunning(settings).catch(() => {});
    await removeCamera(cameraId, settings);
    throw unreachableError(reach);
  }

  await ensureRunning(settings);
  const port = settingsPort(settings);
  await putStream(name, src, { port, host: settingsHost() });
  return { name, src };
}

async function removeCamera(cameraId, settings = {}) {
  const name = streamNameForCamera(cameraId);
  if (!name) return { ok: false };
  if (!(await isRunning(settings))) return { ok: false, skipped: true };
  try {
    await deleteStream(name, null, { port: settingsPort(settings), host: settingsHost() });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function syncAllFromRegistry(registry, settings = {}) {
  if (!settings.go2rtcEnabled) return { synced: [], skipped: [] };
  const results = [];
  const skipped = [];
  for (const rec of registry.listCameraRecords()) {
    if (!rec.rtspUrl) continue;
    try {
      await syncCamera(rec.cameraId, rec.rtspUrl, settings, rec);
      results.push({ cameraId: rec.cameraId, ok: true });
    } catch (e) {
      if (e.skipped || e.code === 'EHOSTUNREACH') {
        skipped.push({
          cameraId: rec.cameraId,
          ok: false,
          skipped: true,
          error: e.message || String(e),
          host: e.host,
          port: e.port,
        });
        console.log(`[go2rtc] skipped ${rec.cameraId}: ${e.message || String(e)}`);
      } else {
        results.push({ cameraId: rec.cameraId, ok: false, error: e.message || String(e) });
      }
    }
  }
  return { synced: results, skipped };
}

function createProxyMiddleware(getSettings) {
  return function go2rtcProxy(req, res) {
    const settings = typeof getSettings === 'function' ? getSettings() : (getSettings || {});
    const port = settingsPort(settings);
    const host = settingsHost();
    const subPath = req.url || '/';

    const headers = { ...req.headers, host: `${host}:${port}` };
    delete headers.connection;

    const proxyReq = http.request({
      hostname: host,
      port,
      path: subPath,
      method: req.method,
      headers,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: `go2rtc proxy: ${err.message}` });
      } else {
        res.end();
      }
    });

    if (req.method === 'GET' || req.method === 'HEAD') {
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  };
}

/**
 * Proxy WebSocket upgrades for /api/go2rtc → go2rtc (required by <video-stream>).
 * Attach to the PeakLogic HTTP server after listen().
 */
function attachUpgradeProxy(server, getSettings, { pathPrefix = '/api/go2rtc' } = {}) {
  if (!server || typeof server.on !== 'function') return;
  const WebSocket = require('ws');
  const prefix = String(pathPrefix || '/api/go2rtc').replace(/\/$/, '');
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = String(req.url || '');
    if (!url.startsWith(`${prefix}/`) && url !== prefix) return;

    const settings = typeof getSettings === 'function' ? getSettings() : (getSettings || {});
    const port = settingsPort(settings);
    const host = settingsHost();
    const subPath = url.slice(prefix.length) || '/';
    const target = `ws://${host}:${port}${subPath}`;

    wss.handleUpgrade(req, socket, head, (client) => {
      const upstream = new WebSocket(target);
      const pending = [];
      let upstreamOpen = false;
      const closeBoth = () => {
        try { client.close(); } catch { /* ignore */ }
        try { upstream.close(); } catch { /* ignore */ }
      };
      const sendUp = (data, isBinary) => {
        const binary = typeof isBinary === 'boolean' ? isBinary : Buffer.isBuffer(data);
        if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary });
        } else {
          pending.push({ data, binary });
        }
      };
      client.on('message', sendUp);
      upstream.on('open', () => {
        upstreamOpen = true;
        for (const item of pending.splice(0)) {
          if (upstream.readyState === WebSocket.OPEN) {
            upstream.send(item.data, { binary: item.binary });
          }
        }
      });
      upstream.on('message', (data, isBinary) => {
        if (client.readyState !== WebSocket.OPEN) return;
        const binary = typeof isBinary === 'boolean' ? isBinary : Buffer.isBuffer(data);
        client.send(data, { binary });
      });
      client.on('close', closeBoth);
      upstream.on('close', closeBoth);
      client.on('error', closeBoth);
      upstream.on('error', closeBoth);
    });
  });
}

function status(settings = {}) {
  const exe = findGo2rtcExe();
  const pid = readPidFile();
  return {
    binaryFound: !!exe,
    binaryPath: exe || '',
    pid: pid || child?.pid || null,
    port: settingsPort(settings),
    configPath: defaultConfigPath(),
  };
}

module.exports = {
  ensureConfigFile,
  isRunning,
  start,
  stop,
  ensureRunning,
  syncCamera,
  removeCamera,
  syncAllFromRegistry,
  createProxyMiddleware,
  attachUpgradeProxy,
  status,
  settingsPort,
};

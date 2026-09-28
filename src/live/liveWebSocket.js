'use strict';

const { WebSocketServer } = require('ws');
const { LIVE_WS_INTERVAL_MS } = require('../config');

const LIVE_WS_PATH = '/api/live';

function wsIntervalMs(tagCount) {
  if (tagCount <= 500) return LIVE_WS_INTERVAL_MS;
  if (tagCount <= 2000) return Math.max(LIVE_WS_INTERVAL_MS, 500);
  return Math.max(LIVE_WS_INTERVAL_MS, 1000);
}

function snapshotLive(tagStore) {
  if (typeof tagStore.liveSnapshotSlim === 'function') return tagStore.liveSnapshotSlim();
  return tagStore.liveSnapshot();
}

function buildLivePayload(deps, { includeHealth = true } = {}) {
  const { tagStore, driverManager, scanEngine } = deps;
  try {
    const { syncMqttParcLiveIo } = require('../parc/parcLiveIoSync');
    syncMqttParcLiveIo(tagStore, driverManager);
  } catch { /* optional */ }
  let optaRuntime = null;
  try {
    const { optaRuntimeSnapshot } = require('../parc/parcLiveIoSync');
    optaRuntime = optaRuntimeSnapshot(driverManager);
  } catch { /* optional */ }
  return {
    runtime: scanEngine.status(),
    optaRuntime,
    live: snapshotLive(tagStore),
    tagCount: tagStore.count(),
    ...(includeHealth ? { driverHealth: driverManager.health() } : {}),
  };
}

function withTenant(tenantId, fn) {
  if (!tenantId) return fn();
  const { runWithProjectTenant } = require('../project/projectTenantContext');
  return runWithProjectTenant(tenantId, fn);
}

function bindLiveClient(wss, ws, deps, { tenantId } = {}) {
  const sendPayload = (includeHealth) => {
    try {
      const payload = withTenant(tenantId, () => buildLivePayload(deps, { includeHealth }));
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
    } catch {
      /* tenant runtime missing or socket closed — HTTP GET /api/live is the fallback */
    }
  };

  sendPayload(true);

  let tagCount = 0;
  try {
    tagCount = withTenant(tenantId, () => deps.tagStore.count());
  } catch { /* empty workspace */ }
  const intervalMs = wsIntervalMs(tagCount);
  let tick = 0;
  let healthTick = 0;

  const iv = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    tick += 1;
    healthTick += 1;
    const includeHealth = tick === 1 || healthTick >= 8;
    if (includeHealth) healthTick = 0;
    sendPayload(includeHealth);
  }, intervalMs);

  ws.on('close', () => clearInterval(iv));
  ws.on('error', () => clearInterval(iv));
}

function rejectUpgrade(socket, status, message) {
  const body = message || 'Unauthorized';
  const payload = Buffer.from(body, 'utf8');
  try {
    socket.write(
      `HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Forbidden'}\r\n`
      + 'Connection: close\r\n'
      + 'Content-Type: text/plain; charset=utf-8\r\n'
      + `Content-Length: ${payload.length}\r\n`
      + '\r\n',
    );
    socket.write(payload);
  } catch { /* ignore */ }
  try { socket.destroy(); } catch { /* ignore */ }
}

async function resolveLiveWsTenant(req) {
  try {
    const { isCloudDeployment } = require('../cloud/agentProtocol');
    if (!isCloudDeployment()) return null;
    const { attachSession } = require('../tenants/authMiddleware');
    attachSession(req, {}, () => {});
    if (!req.mvAuth) return false;
    const { resolveProjectTenantId } = require('../project/projectTenantContext');
    const tid = resolveProjectTenantId(req);
    if (!tid) return false;
    const tenantRuntime = require('../tenants/tenantRuntime');
    await tenantRuntime.ensureLoaded(tid);
    return tid;
  } catch (e) {
    console.warn('[live-ws] tenant resolve failed:', e.message || e);
    return false;
  }
}

/**
 * Push live tag/runtime updates over WebSocket at /api/live (same path as embedded est).
 * Uses noServer + manual upgrade routing so go2rtc (/api/go2rtc/...) is not rejected.
 * HTTP GET /api/live remains available as a fallback.
 */
function attachLiveWebSocket(httpServer, deps) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(String(req.url || '/'), 'http://127.0.0.1').pathname;
    if (pathname !== LIVE_WS_PATH) return;

    Promise.resolve(resolveLiveWsTenant(req)).then((tenantId) => {
      if (socket.destroyed) return;
      if (tenantId === false) {
        rejectUpgrade(socket, 401, 'Authentication required');
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        bindLiveClient(wss, ws, deps, { tenantId: tenantId || null });
      });
    }).catch((e) => {
      console.warn('[live-ws] upgrade failed:', e.message || e);
      rejectUpgrade(socket, 401, 'Authentication required');
    });
  });

  return wss;
}

module.exports = {
  attachLiveWebSocket,
  buildLivePayload,
  wsIntervalMs,
  LIVE_WS_PATH,
};

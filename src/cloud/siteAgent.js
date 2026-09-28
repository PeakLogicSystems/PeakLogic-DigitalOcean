'use strict';

const persistence = require('../persistence');
const { registry } = require('../cameras/cameraRegistry');
const go2rtc = require('../cameras/go2rtcManager');
const {
  MSG,
  PROTOCOL_VERSION,
  redactCameraForCloud,
  parseMessage,
  encodeMessage,
} = require('./agentProtocol');

const AGENT_FILE = 'cloud-agent.json';

const DEFAULT_CONFIG = {
  enabled: false,
  cloudUrl: '',
  siteId: '',
  pairingCode: '',
  agentToken: '',
  heartbeatMs: 15000,
  inventoryMs: 30000,
};

let ws = null;
let heartbeatTimer = null;
let inventoryTimer = null;
let reconnectTimer = null;
let starting = false;
let intentionalStop = false;
/** @type {Map<string, { localWs: import('ws'), mediaWs: import('ws') }>} */
const mediaBridges = new Map();

function loadConfig() {
  const raw = persistence.readJson(AGENT_FILE, null);
  return { ...DEFAULT_CONFIG, ...(raw && typeof raw === 'object' ? raw : {}) };
}

function saveConfig(cfg) {
  persistence.writeJson(AGENT_FILE, { ...DEFAULT_CONFIG, ...cfg });
}

function status() {
  const cfg = loadConfig();
  return {
    enabled: !!cfg.enabled,
    cloudUrl: cfg.cloudUrl || '',
    siteId: cfg.siteId || '',
    hasToken: !!cfg.agentToken,
    hasPairingCode: !!cfg.pairingCode,
    connected: !!(ws && ws.readyState === 1),
    protocolVersion: PROTOCOL_VERSION,
  };
}

function updateConfig(patch = {}) {
  const prev = loadConfig();
  const next = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, k)) {
      next[k] = v;
    }
  }
  next.enabled = !!next.enabled;
  next.cloudUrl = String(next.cloudUrl || '').replace(/\/$/, '');
  next.siteId = String(next.siteId || '').trim();
  next.pairingCode = String(next.pairingCode || '').trim();
  next.agentToken = String(next.agentToken || '').trim();
  next.heartbeatMs = Math.max(5000, Number(next.heartbeatMs) || 15000);
  next.inventoryMs = Math.max(10000, Number(next.inventoryMs) || 30000);

  // Explicit re-pair: a fresh pairing code invalidates any stored agent token.
  if (patch.pairingCode != null && String(patch.pairingCode).trim()) {
    next.agentToken = '';
  }

  saveConfig(next);
  if (next.enabled && next.cloudUrl && next.siteId && (next.agentToken || next.pairingCode)) {
    start().catch((e) => console.warn('[site-agent]', e.message || e));
  } else {
    stop();
  }
  return status();
}

function cloudWsBase(cloudUrl) {
  // Bare hostnames (peaklogic.io) must use https/wss — defaulting to http yields ws://:80 and never pairs.
  const raw = String(cloudUrl || '').trim();
  const withScheme = raw.includes('://') ? raw : `https://${raw}`;
  const u = new URL(withScheme);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.origin;
}

function agentControlUrl(cfg) {
  const base = cloudWsBase(cfg.cloudUrl);
  const q = new URLSearchParams();
  // Prefer long-lived agent token. Pairing is one-shot and is invalidated after welcome;
  // preferring it while a token exists causes a 401 reconnect death spiral.
  if (cfg.agentToken) q.set('token', cfg.agentToken);
  else if (cfg.pairingCode) q.set('pairingCode', cfg.pairingCode);
  return `${base}/api/sites/${encodeURIComponent(cfg.siteId)}/agent?${q.toString()}`;
}

function cloudHttpBase(cloudUrl) {
  const raw = String(cloudUrl || '').trim();
  const withScheme = raw.includes('://') ? raw : `https://${raw}`;
  return new URL(withScheme).origin;
}

function buildInventory(siteId) {
  return registry.listCameras().map((c) => redactCameraForCloud(c, siteId)).filter(Boolean);
}

function pushInventory() {
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.siteId || !cfg.cloudUrl) {
    console.warn('[site-agent] inventory skipped — agent disabled or not configured');
    return;
  }
  const cameras = buildInventory(cfg.siteId);
  const wsOpen = !!(ws && ws.readyState === 1);
  console.log(`[site-agent] inventory push site=${cfg.siteId} cameras=${cameras.length} ws=${wsOpen}`);

  if (wsOpen) {
    try {
      ws.send(encodeMessage(MSG.INVENTORY, {
        siteId: cfg.siteId,
        cameras,
      }));
    } catch (e) {
      console.warn('[site-agent] inventory ws send:', e.message || e);
    }
  }

  // HTTP backup so cloud catalog updates even if WS inventory is dropped.
  if (!cfg.agentToken) {
    if (!wsOpen) {
      console.warn('[site-agent] inventory skipped — not connected (enable agent + pairing code, then Save)');
    }
    return;
  }
  const url = `${cloudHttpBase(cfg.cloudUrl)}/api/sites/${encodeURIComponent(cfg.siteId)}/inventory`;
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-token': cfg.agentToken,
    },
    body: JSON.stringify({ cameras }),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[site-agent] inventory HTTP ${res.status}: ${text.slice(0, 160)}`);
      return;
    }
    const data = await res.json().catch(() => ({}));
    console.log(`[site-agent] inventory HTTP ok upserted=${data.upserted} total=${data.total}`);
  }).catch((e) => {
    console.warn('[site-agent] inventory HTTP:', e.message || e);
  });
}

function clearTimers() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (inventoryTimer) clearInterval(inventoryTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  heartbeatTimer = inventoryTimer = reconnectTimer = null;
}

function scheduleReconnect() {
  const cfg = loadConfig();
  if (!cfg.enabled || intentionalStop) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    start().catch(() => {});
  }, 5000);
}

async function start() {
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.cloudUrl || !cfg.siteId) return status();
  if (!cfg.agentToken && !cfg.pairingCode) return status();
  if (starting) return status();
  // Already connected or handshake in flight — do not kill the live socket.
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return status();

  starting = true;
  intentionalStop = false;
  try {
    stopSocketOnly();
    const WebSocket = require('ws');
    const url = agentControlUrl(cfg);
    const sock = new WebSocket(url);
    ws = sock;

    sock.on('unexpected-response', (_req, res) => {
      const code = res && res.statusCode;
      console.warn(`[site-agent] handshake HTTP ${code} for site=${cfg.siteId}`);
      if (code === 401) {
        const cur = loadConfig();
        if (cur.agentToken && cur.pairingCode) {
          // After a successful pair, pairing is dead; keep the welcome token.
          cur.pairingCode = '';
          saveConfig(cur);
          console.warn('[site-agent] cleared used pairingCode; will retry with agentToken');
        } else if (cur.agentToken && !cur.pairingCode) {
          console.warn('[site-agent] agentToken rejected — Re-pair on cloud and paste a new pairing code');
        } else if (!cur.agentToken) {
          console.warn('[site-agent] auth rejected — create/re-pair the site on cloud and paste a new pairing code');
        }
      } else if (code === 404) {
        console.warn('[site-agent] site not found on cloud — check siteId');
      }
      try { res.resume(); } catch { /* ignore */ }
    });

    sock.on('open', () => {
      if (ws !== sock) return;
      console.log(`[site-agent] connected to ${cfg.cloudUrl} site=${cfg.siteId}`);
      clearTimers();
      const conf = loadConfig();
      heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === 1) ws.send(encodeMessage(MSG.HEARTBEAT, { siteId: conf.siteId }));
      }, conf.heartbeatMs);
      inventoryTimer = setInterval(pushInventory, conf.inventoryMs);
      pushInventory();
    });

    sock.on('message', (raw) => {
      if (ws !== sock) return;
      const msg = parseMessage(raw);
      if (!msg) return;
      handleControlMessage(msg).catch((e) => {
        console.warn('[site-agent] message handler:', e.message || e);
      });
    });

    sock.on('close', () => {
      if (ws !== sock) return;
      console.warn('[site-agent] disconnected');
      ws = null;
      clearTimers();
      closeAllMediaBridges();
      scheduleReconnect();
    });

    sock.on('error', (err) => {
      if (ws !== sock) return;
      console.warn('[site-agent] error:', err.message || err);
    });
  } finally {
    starting = false;
  }
  return status();
}

function stopSocketOnly() {
  if (!ws) return;
  const sock = ws;
  ws = null;
  try {
    sock.removeAllListeners('open');
    sock.removeAllListeners('message');
    sock.removeAllListeners('close');
    sock.removeAllListeners('unexpected-response');
    sock.on('error', () => {});
    if (sock.readyState === sock.CONNECTING) sock.terminate();
    else sock.close();
  } catch { /* ignore */ }
}

function stop() {
  intentionalStop = true;
  clearTimers();
  closeAllMediaBridges();
  stopSocketOnly();
  return status();
}

async function handleControlMessage(msg) {
  switch (msg.type) {
    case MSG.WELCOME:
      if (msg.agentToken) {
        const cfg = loadConfig();
        cfg.agentToken = String(msg.agentToken);
        cfg.pairingCode = '';
        saveConfig(cfg);
        console.log('[site-agent] stored agent token from pairing welcome');
      } else {
        const cfg = loadConfig();
        if (cfg.pairingCode) {
          cfg.pairingCode = '';
          saveConfig(cfg);
        }
      }
      pushInventory();
      break;
    case MSG.VIEWER_OPEN:
      await openMediaBridge(msg);
      break;
    case MSG.VIEWER_CLOSE:
      closeMediaBridge(msg.sessionId);
      break;
    case MSG.INVENTORY_ACK:
      console.log(`[site-agent] inventory_ack upserted=${msg.upserted} total=${msg.total}`);
      break;
    case MSG.HEARTBEAT_ACK:
    case MSG.SNAPSHOT_ACK:
      break;
    case MSG.ERROR:
      console.warn('[site-agent] cloud error:', msg.error || msg.message || msg);
      break;
    default:
      break;
  }
}

async function openMediaBridge(msg) {
  const sessionId = String(msg.sessionId || '').trim();
  const cameraId = String(msg.cameraId || '').trim();
  if (!sessionId || !cameraId) return;

  closeMediaBridge(sessionId);

  const rec = registry.getCameraRecord(cameraId);
  if (!rec || !rec.rtspUrl) {
    if (ws && ws.readyState === 1) {
      ws.send(encodeMessage(MSG.VIEWER_ERROR, {
        sessionId,
        cameraId,
        error: 'Camera has no RTSP URL on appliance — run Probe',
      }));
    }
    return;
  }

  const settings = registry.settings();
  try {
    await go2rtc.syncCamera(cameraId, rec.rtspUrl, settings, rec);
  } catch (e) {
    if (ws && ws.readyState === 1) {
      ws.send(encodeMessage(MSG.VIEWER_ERROR, {
        sessionId,
        cameraId,
        error: e.message || String(e),
      }));
    }
    return;
  }

  const cfg = loadConfig();
  const WebSocket = require('ws');
  const mediaUrl = cloudWsBase(cfg.cloudUrl)
    + '/api/sites/' + encodeURIComponent(cfg.siteId) + '/agent/media'
    + '?token=' + encodeURIComponent(cfg.agentToken)
    + '&sessionId=' + encodeURIComponent(sessionId)
    + '&cameraId=' + encodeURIComponent(cameraId);
  const localWsUrl = 'ws://127.0.0.1:' + (Number(settings.go2rtcPort) || 1984)
    + '/api/ws?src=' + encodeURIComponent(cameraId);

  const mediaWs = new WebSocket(mediaUrl);
  const localWs = new WebSocket(localWsUrl);
  const bridge = { localWs, mediaWs };
  mediaBridges.set(sessionId, bridge);

  const pipe = (from, to) => {
    from.on('message', (data, isBinary) => {
      if (to.readyState === WebSocket.OPEN) {
        const binary = typeof isBinary === 'boolean' ? isBinary : Buffer.isBuffer(data);
        try { to.send(data, { binary }); } catch { /* ignore */ }
      }
    });
  };
  pipe(localWs, mediaWs);
  pipe(mediaWs, localWs);

  const fail = (err) => {
    console.warn('[site-agent] media bridge:', (err && err.message) || err || 'closed');
    closeMediaBridge(sessionId);
  };
  mediaWs.on('error', fail);
  localWs.on('error', fail);
  mediaWs.on('close', () => closeMediaBridge(sessionId));
  localWs.on('close', () => closeMediaBridge(sessionId));
}

function closeMediaBridge(sessionId) {
  const bridge = mediaBridges.get(sessionId);
  if (!bridge) return;
  mediaBridges.delete(sessionId);
  try { bridge.localWs.close(); } catch { /* ignore */ }
  try { bridge.mediaWs.close(); } catch { /* ignore */ }
}

function closeAllMediaBridges() {
  for (const id of [...mediaBridges.keys()]) closeMediaBridge(id);
}

function pushSnapshotMeta(cameraId, meta) {
  if (!ws || ws.readyState !== 1) return false;
  const cfg = loadConfig();
  ws.send(encodeMessage(MSG.SNAPSHOT_PUSH, {
    siteId: cfg.siteId,
    cameraId,
    ...(meta || {}),
  }));
  return true;
}

module.exports = {
  AGENT_FILE,
  loadConfig,
  saveConfig,
  status,
  updateConfig,
  start,
  stop,
  pushInventory,
  pushSnapshotMeta,
  buildInventory,
};

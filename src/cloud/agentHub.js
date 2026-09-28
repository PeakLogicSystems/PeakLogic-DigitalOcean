'use strict';

const crypto = require('crypto');
const http = require('http');
const { siteStore } = require('./siteStore');
const {
  MSG,
  parseMessage,
  encodeMessage,
  isCloudDeployment,
} = require('./agentProtocol');

/** @type {Map<string, { ws: import('ws'), siteId: string }>} */
const agentsBySite = new Map();

/** @type {Map<string, MediaSession>} */
const mediaSessions = new Map();

/**
 * @typedef {{
 *   sessionId: string,
 *   siteId: string,
 *   cameraId: string,
 *   browserClients: Set<import('ws')>,
 *   agentMedia: import('ws')|null,
 *   createdAt: number,
 * }} MediaSession
 */

function randomId() {
  return crypto.randomBytes(12).toString('hex');
}

function getAgent(siteId) {
  return agentsBySite.get(String(siteId)) || null;
}

function isAgentOnline(siteId) {
  const a = getAgent(siteId);
  return !!(a && a.ws && a.ws.readyState === 1);
}

function listOnlineSiteIds() {
  const ids = [];
  for (const [siteId, a] of agentsBySite.entries()) {
    if (a && a.ws && a.ws.readyState === 1) ids.push(siteId);
  }
  return ids;
}

/** Drop the live control socket for a site (delete / re-pair). */
function disconnectAgent(siteId) {
  const id = String(siteId || '').trim();
  const a = agentsBySite.get(id);
  if (a?.ws) {
    try { a.ws.close(4000, 'site reset'); } catch { /* ignore */ }
  }
  agentsBySite.delete(id);
  for (const [sid, sess] of [...mediaSessions.entries()]) {
    if (sess.siteId === id) {
      try { sess.agentMedia?.close(); } catch { /* ignore */ }
      for (const c of sess.browserClients || []) {
        try { c.close(); } catch { /* ignore */ }
      }
      mediaSessions.delete(sid);
    }
  }
  try { siteStore.setAgentOnline(id, false); } catch { /* ignore */ }
}

function sendToAgent(siteId, type, payload = {}) {
  const a = getAgent(siteId);
  if (!a || a.ws.readyState !== 1) return false;
  a.ws.send(encodeMessage(type, payload));
  return true;
}

function viewerCount(siteId) {
  let n = 0;
  for (const s of mediaSessions.values()) {
    if (s.siteId === siteId) n += s.browserClients.size;
  }
  return n;
}

function enforceViewerLimit(siteId) {
  const max = Number(siteStore.settings().maxViewersPerSite) || 4;
  if (!siteStore.settings().entitlementRemoteView) {
    return { ok: false, error: 'Remote camera viewing is not entitled for this deployment' };
  }
  if (viewerCount(siteId) >= max) {
    return { ok: false, error: `Viewer limit reached (${max} concurrent per site)` };
  }
  return { ok: true, max };
}

/**
 * Open a media session and ask the site agent to attach go2rtc.
 * @returns {{ sessionId: string } | { error: string }}
 */
function openViewerSession(siteId, cameraId) {
  const site = siteStore.getSite(siteId);
  if (!site) return { error: 'Site not found' };
  if (!site.agentOnline && !isAgentOnline(siteId)) {
    return { error: 'Site agent offline — live view unavailable' };
  }
  const cam = siteStore.getCamera(siteId, cameraId);
  if (!cam) return { error: 'Camera not in cloud catalog — wait for inventory sync' };
  if (!cam.hasStream && cam.probeStatus !== 'ok') {
    return { error: 'Camera has no stream — probe on the site appliance first' };
  }
  const limit = enforceViewerLimit(siteId);
  if (!limit.ok) return { error: limit.error };

  const sessionId = randomId();
  /** @type {MediaSession} */
  const session = {
    sessionId,
    siteId: String(siteId),
    cameraId: String(cameraId),
    browserClients: new Set(),
    agentMedia: null,
    createdAt: Date.now(),
  };
  mediaSessions.set(sessionId, session);

  const ok = sendToAgent(siteId, MSG.VIEWER_OPEN, {
    sessionId,
    cameraId,
    mediaPath: `/api/sites/${encodeURIComponent(siteId)}/agent/media?sessionId=${encodeURIComponent(sessionId)}&cameraId=${encodeURIComponent(cameraId)}`,
  });
  if (!ok) {
    mediaSessions.delete(sessionId);
    return { error: 'Site agent not connected' };
  }
  siteStore.setViewerCount(siteId, viewerCount(siteId));
  return { sessionId };
}

function closeViewerSession(sessionId, reason = '') {
  const session = mediaSessions.get(sessionId);
  if (!session) return;
  for (const client of session.browserClients) {
    try { client.close(); } catch { /* ignore */ }
  }
  session.browserClients.clear();
  if (session.agentMedia) {
    try { session.agentMedia.close(); } catch { /* ignore */ }
  }
  mediaSessions.delete(sessionId);
  sendToAgent(session.siteId, MSG.VIEWER_CLOSE, { sessionId, reason });
  siteStore.setViewerCount(session.siteId, viewerCount(session.siteId));
}

function renderCloudPlayerHtml(siteId, cameraId, { sessionId } = {}) {
  const sid = sessionId || '';
  const wsPath = `/api/sites/${encodeURIComponent(siteId)}/cameras/${encodeURIComponent(cameraId)}/ws`
    + (sid ? `?sessionId=${encodeURIComponent(sid)}` : '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Camera ${cameraId}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0a0a0a; overflow: hidden; color: #e2e8f0; font-family: system-ui, sans-serif; }
    video-stream { display: block; width: 100%; height: 100%; }
    .offline { display:flex; align-items:center; justify-content:center; height:100%; padding:1rem; text-align:center; }
  </style>
  <script type="module" src="/api/go2rtc/video-stream.js"></script>
</head>
<body>
  <script type="module">
    const el = document.createElement('video-stream');
    el.background = true;
    el.mode = 'mse,hls,mjpeg,webrtc';
    el.src = new URL(${JSON.stringify(wsPath)}, location.href);
    document.body.appendChild(el);
  </script>
</body>
</html>`;
}

function attachAgentHub(server, { pathPrefix = '/api/sites' } = {}) {
  if (!server || typeof server.on !== 'function') return;
  const WebSocket = require('ws');
  const prefix = String(pathPrefix || '/api/sites').replace(/\/$/, '');
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    if (!path.startsWith(`${prefix}/`)) return;

    // Agent control: /api/sites/:siteId/agent
    const agentMatch = path.match(/^\/api\/sites\/([^/]+)\/agent\/?$/);
    if (agentMatch) {
      const siteId = decodeURIComponent(agentMatch[1]);
      const token = url.searchParams.get('token') || '';
      const pairing = url.searchParams.get('pairingCode') || '';
      let auth = siteStore.authenticateAgentToken(siteId, token);
      let justPaired = false;
      if (!auth && pairing) {
        auth = siteStore.authenticatePairing(siteId, pairing);
        justPaired = !!auth;
      }
      if (!auth) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        bindAgentControl(ws, siteId, { justPaired, agentTokenPlain: justPaired ? undefined : token });
      });
      return;
    }

    // Agent media uplink: /api/sites/:siteId/agent/media
    const mediaMatch = path.match(/^\/api\/sites\/([^/]+)\/agent\/media\/?$/);
    if (mediaMatch) {
      const siteId = decodeURIComponent(mediaMatch[1]);
      const token = url.searchParams.get('token') || '';
      const sessionId = url.searchParams.get('sessionId') || '';
      if (!siteStore.authenticateAgentToken(siteId, token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      const session = mediaSessions.get(sessionId);
      if (!session || session.siteId !== siteId) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        session.agentMedia = ws;
        sendToAgent(siteId, MSG.VIEWER_READY, { sessionId, cameraId: session.cameraId });
        ws.on('message', (data, isBinary) => {
          const binary = typeof isBinary === 'boolean' ? isBinary : Buffer.isBuffer(data);
          for (const client of session.browserClients) {
            if (client.readyState === WebSocket.OPEN) {
              try { client.send(data, { binary }); } catch { /* ignore */ }
            }
          }
        });
        ws.on('close', () => {
          if (session.agentMedia === ws) session.agentMedia = null;
        });
        ws.on('error', () => {
          if (session.agentMedia === ws) session.agentMedia = null;
        });
      });
      return;
    }

    // Browser viewer WS: /api/sites/:siteId/cameras/:cameraId/ws
    const viewMatch = path.match(/^\/api\/sites\/([^/]+)\/cameras\/([^/]+)\/ws\/?$/);
    if (viewMatch) {
      const siteId = decodeURIComponent(viewMatch[1]);
      const cameraId = decodeURIComponent(viewMatch[2]);
      let sessionId = url.searchParams.get('sessionId') || '';
      let session = sessionId ? mediaSessions.get(sessionId) : null;
      if (!session) {
        const opened = openViewerSession(siteId, cameraId);
        if (opened.error) {
          socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        sessionId = opened.sessionId;
        session = mediaSessions.get(sessionId);
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        session.browserClients.add(ws);
        siteStore.setViewerCount(siteId, viewerCount(siteId));
        ws.on('message', (data, isBinary) => {
          if (session.agentMedia && session.agentMedia.readyState === WebSocket.OPEN) {
            const binary = typeof isBinary === 'boolean' ? isBinary : Buffer.isBuffer(data);
            try { session.agentMedia.send(data, { binary }); } catch { /* ignore */ }
          }
        });
        ws.on('close', () => {
          session.browserClients.delete(ws);
          siteStore.setViewerCount(siteId, viewerCount(siteId));
          if (session.browserClients.size === 0) {
            setTimeout(() => {
              const s = mediaSessions.get(sessionId);
              if (s && s.browserClients.size === 0) closeViewerSession(sessionId, 'no viewers');
            }, 5000);
          }
        });
      });
    }
  });
}

function bindAgentControl(ws, siteId, { justPaired } = {}) {
  const prev = agentsBySite.get(siteId);
  if (prev?.ws && prev.ws !== ws) {
    try { prev.ws.close(); } catch { /* ignore */ }
  }
  agentsBySite.set(siteId, { ws, siteId });
  // Always stamp heartbeat so Cameras UI / _publicSite see a fresh "online".
  siteStore.heartbeat(siteId);

  if (justPaired) {
    const rotated = siteStore.rotateAgentToken(siteId);
    ws.send(encodeMessage(MSG.WELCOME, {
      siteId,
      agentToken: rotated?.agentToken || '',
      paired: true,
    }));
  } else {
    ws.send(encodeMessage(MSG.WELCOME, { siteId, paired: true }));
  }

  ws.on('message', (raw) => {
    const msg = parseMessage(raw);
    if (!msg) return;
    switch (msg.type) {
      case MSG.HEARTBEAT:
        siteStore.heartbeat(siteId);
        ws.send(encodeMessage(MSG.HEARTBEAT_ACK, { siteId }));
        break;
      case MSG.INVENTORY: {
        const cameras = Array.isArray(msg.cameras) ? msg.cameras : [];
        try {
          console.log(`[agent-hub] inventory site=${siteId} cameras=${cameras.length}`);
          const result = siteStore.mergeInventory(siteId, cameras);
          ws.send(encodeMessage(MSG.INVENTORY_ACK, result));
        } catch (e) {
          console.warn('[agent-hub] inventory failed:', e.message || e);
          ws.send(encodeMessage(MSG.ERROR, { error: e.message || String(e), siteId }));
        }
        break;
      }
      case MSG.VIEWER_ERROR:
        if (msg.sessionId) closeViewerSession(msg.sessionId, msg.error || 'agent error');
        break;
      case MSG.SNAPSHOT_PUSH:
        // Phase 2 hook: acknowledge; persistence can be wired to GridFS later.
        ws.send(encodeMessage(MSG.SNAPSHOT_ACK, {
          cameraId: msg.cameraId || '',
          ok: true,
          stored: false,
          note: 'snapshot mirror acknowledged (GridFS optional)',
        }));
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    const cur = agentsBySite.get(siteId);
    if (cur?.ws === ws) {
      agentsBySite.delete(siteId);
      siteStore.setAgentOnline(siteId, false);
    }
  });
}

module.exports = {
  attachAgentHub,
  openViewerSession,
  closeViewerSession,
  renderCloudPlayerHtml,
  isAgentOnline,
  listOnlineSiteIds,
  disconnectAgent,
  viewerCount,
  getAgent,
  sendToAgent,
  agentsBySite,
  mediaSessions,
  isCloudDeployment,
};

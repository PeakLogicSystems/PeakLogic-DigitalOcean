'use strict';

/**
 * WebSocket live updates — primary path for tag/runtime refresh (fallback: HTTP poll).
 */
window.PeaklogicLiveWs = (function () {
  let ws = null;
  let reconnectTimer = null;
  let onMessage = null;
  let onStatus = null;
  let connected = false;
  let reconnectMs = 1000;
  let failCount = 0;

  function wsUrl() {
    const base = String(window.PEAKLOGIC_API_BASE || '').trim().replace(/\/$/, '');
    const apiPath = base || '/api';
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = loc.host;
    if (apiPath.startsWith('http')) {
      const u = new URL(apiPath);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${u.host}${u.pathname.replace(/\/$/, '')}/live`;
    }
    return `${proto}//${host}${apiPath}/live`;
  }

  function setConnected(next) {
    if (connected === next) return;
    connected = next;
    onStatus?.(connected);
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
    failCount += 1;
    // Back off quickly so a missing WS upgrade does not spam the console.
    // HTTP poll (refreshLive / getLive) stays the live path while disconnected.
    reconnectMs = failCount >= 3
      ? Math.min(reconnectMs * 2, 60_000)
      : Math.min(reconnectMs * 1.5, 15_000);
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      setConnected(false);
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      reconnectMs = 1000;
      failCount = 0;
      setConnected(true);
    });

    ws.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        onMessage?.(data);
      } catch { /* ignore malformed frames */ }
    });

    ws.addEventListener('close', () => {
      setConnected(false);
      ws = null;
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      setConnected(false);
    });
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectMs = 1000;
    failCount = 0;
    if (ws) {
      ws.close();
      ws = null;
    }
    setConnected(false);
  }

  function start(handlers = {}) {
    onMessage = handlers.onMessage || null;
    onStatus = handlers.onStatus || null;
    connect();
  }

  function isConnected() {
    return connected;
  }

  return {
    start,
    disconnect,
    isConnected,
    connect,
  };
})();

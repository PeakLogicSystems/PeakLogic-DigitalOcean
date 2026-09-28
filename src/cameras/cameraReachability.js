'use strict';

const { parseHostPort } = require('./cameraRegistry');
const { tcpPortOpen } = require('./subnetSweep');

/** @type {Map<string, { ok: boolean, checkedAt: number, host: string, port: number, error: string }>} */
const cache = new Map();

function cacheKey(host, port) {
  return `${host}:${port}`;
}

function reachabilityEnabled(settings = {}) {
  return settings.rtspReachabilityCheckEnabled !== false;
}

function cacheTtlMs(settings = {}) {
  return Math.max(500, Number(settings.rtspReachabilityCacheMs) || 30000);
}

function connectTimeoutMs(settings = {}) {
  return Math.max(200, Math.min(10000, Number(settings.rtspReachabilityTimeoutMs) || 1500));
}

/**
 * Resolve RTSP TCP target from URL, falling back to camera host / settings.rtspPort.
 * @returns {{ host: string, port: number }}
 */
function parseRtspTarget(rtspUrl, camera = {}, settings = {}) {
  const raw = String(rtspUrl || '').trim();
  let host = '';
  let port = Number(settings.rtspPort) || 554;

  if (raw) {
    try {
      const u = new URL(raw);
      host = u.hostname;
      if (u.port) port = Number(u.port);
    } catch {
      const normalized = raw.replace(/^rtsp:\/\//i, 'http://');
      const parsed = parseHostPort(normalized);
      host = parsed.host;
      if (parsed.port && parsed.port !== 80) port = parsed.port;
    }
  }

  if (!host) host = String(camera.host || '').trim();
  return { host, port };
}

function invalidateReachabilityCache(host, port) {
  const h = String(host || '').trim();
  if (!h) return;
  const p = Number(port) || 554;
  cache.delete(cacheKey(h, p));
}

function clearReachabilityCache() {
  cache.clear();
}

/**
 * TCP probe of the camera RTSP port before registering with go2rtc.
 * @returns {Promise<{ ok: boolean, host: string, port: number, error: string, checkedAt: number, cached?: boolean }>}
 */
async function checkRtspReachability(rtspUrl, camera = {}, settings = {}) {
  const target = parseRtspTarget(rtspUrl, camera, settings);
  if (!target.host) {
    return {
      ok: false,
      host: '',
      port: target.port,
      error: 'RTSP URL has no host',
      checkedAt: Date.now(),
    };
  }

  if (!reachabilityEnabled(settings)) {
    return {
      ok: true,
      host: target.host,
      port: target.port,
      error: '',
      checkedAt: Date.now(),
    };
  }

  const key = cacheKey(target.host, target.port);
  const ttl = cacheTtlMs(settings);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.checkedAt < ttl) {
    return { ...cached, cached: true };
  }

  const timeoutMs = connectTimeoutMs(settings);
  const ok = await tcpPortOpen(target.host, target.port, timeoutMs);
  const result = {
    ok,
    host: target.host,
    port: target.port,
    error: ok ? '' : `RTSP ${target.host}:${target.port} unreachable`,
    checkedAt: Date.now(),
  };
  cache.set(key, result);
  return result;
}

function unreachableError(reach) {
  const err = Object.assign(new Error(reach.error || 'RTSP endpoint unreachable'), {
    code: 'EHOSTUNREACH',
    status: 503,
    skipped: true,
    host: reach.host,
    port: reach.port,
  });
  return err;
}

module.exports = {
  parseRtspTarget,
  checkRtspReachability,
  invalidateReachabilityCache,
  clearReachabilityCache,
  unreachableError,
  reachabilityEnabled,
};

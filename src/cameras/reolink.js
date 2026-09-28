'use strict';

const { parseHostPort } = require('./cameraRegistry');

const REOLINK_ONVIF_PORTS = [8000, 80];
const REOLINK_RTSP_PORT = 554;
const REOLINK_RTSP_PATHS = {
  sub: 'h264Preview_01_sub',
  main: 'h264Preview_01_main',
};

function isReolinkModelToken(value) {
  const token = String(value || '').trim();
  return /^RL[CN]-\d/i.test(token);
}

function isReolinkHit(hit) {
  const blob = [
    hit?.manufacturer,
    hit?.model,
    hit?.name,
    hit?.hardware,
    hit?.scopes,
  ].join(' ').toLowerCase();
  if (blob.includes('reolink')) return true;
  return isReolinkModelToken(hit?.model) || isReolinkModelToken(hit?.manufacturer);
}

function isReolinkDevice(info) {
  const blob = [info?.manufacturer, info?.model, info?.name].join(' ').toLowerCase();
  if (blob.includes('reolink')) return true;
  return isReolinkModelToken(info?.model) || isReolinkModelToken(info?.manufacturer);
}

function reolinkOnvifCandidates(host) {
  const h = String(host || '').trim();
  if (!h) return [];
  const out = [];
  for (const port of REOLINK_ONVIF_PORTS) {
    out.push(`http://${h}:${port}/onvif/device_service`);
  }
  return out;
}

function expandDiscoveryHits(hits) {
  const expanded = [];
  const seen = new Set();
  for (const hit of hits || []) {
    const add = (item) => {
      // Prefer one entry per host so auto-add doesn't create port 80 + 8000 duplicates.
      const key = String(item.host || parseHostPort(item.onvifUrl).host || '').toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      expanded.push(item);
    };
    const host = hit.host || parseHostPort(hit.onvifUrl).host;
    const reolink = isReolinkHit(hit) || hit.vendor === 'reolink';
    // Prefer Reolink ONVIF port 8000 when expanding candidates for that host.
    if (reolink || Number(hit.port) === 8000 || /:8000\b/.test(String(hit.onvifUrl || ''))) {
      const url = `http://${host}:8000/onvif/device_service`;
      add({
        ...hit,
        host,
        port: 8000,
        onvifUrl: url,
        vendor: reolink ? 'reolink' : (hit.vendor || ''),
      });
      continue;
    }
    add(hit);
  }
  return expanded;
}

function buildRtspUrl({ host, username, password, stream = 'sub', rtspPort = REOLINK_RTSP_PORT }) {
  const h = String(host || '').trim();
  if (!h) return '';
  const path = REOLINK_RTSP_PATHS[stream] || REOLINK_RTSP_PATHS.sub;
  const user = encodeURIComponent(username || '');
  const pass = encodeURIComponent(password || '');
  if (username) return `rtsp://${user}:${pass}@${h}:${rtspPort}/${path}`;
  return `rtsp://${h}:${rtspPort}/${path}`;
}

function rtspHasCredentials(rtspUrl) {
  try {
    const u = new URL(rtspUrl);
    return !!(u.username || u.password);
  } catch {
    return /rtsp:\/\/[^/@]+@/i.test(String(rtspUrl || ''));
  }
}

/**
 * Normalize a Reolink RTSP URI. Always inject username/password when provided —
 * Onvif GetStreamUri often returns a credential-less URL that browsers/go2rtc
 * cannot authenticate against (hangs → blank player / spinning "Open").
 */
function normalizeReolinkRtspUrl(rtspUrl, { host, username, password, preferSubstream = true, rtspPort = REOLINK_RTSP_PORT } = {}) {
  const raw = String(rtspUrl || '').trim();
  const stream = preferSubstream ? 'sub' : 'main';

  // Already a known Reolink path with credentials — keep it.
  if (raw && /h264Preview/i.test(raw) && (!username || rtspHasCredentials(raw))) {
    return raw;
  }

  // Rebuild from host with credentials + canonical path (h264Preview_01_sub/main).
  const hostFromRaw = (() => {
    try { return new URL(raw).hostname; } catch { return parseHostPort(raw).host; }
  })();
  return buildRtspUrl({
    host: host || hostFromRaw,
    username,
    password,
    stream,
    rtspPort,
  }) || (raw && rtspHasCredentials(raw) ? raw : '');
}

function viewerUrlForCamera(cameraId, opts = {}) {
  const basePath = opts.basePath || opts.apiBase || '/api';
  const backend = opts.backend || 'mjpeg';
  const id = encodeURIComponent(cameraId);
  if (backend === 'go2rtc') {
    return `${basePath}/cameras/${id}/player`;
  }
  return `${basePath}/cameras/${id}/mjpeg`;
}

module.exports = {
  REOLINK_ONVIF_PORTS,
  REOLINK_RTSP_PORT,
  REOLINK_RTSP_PATHS,
  isReolinkHit,
  isReolinkDevice,
  reolinkOnvifCandidates,
  expandDiscoveryHits,
  buildRtspUrl,
  normalizeReolinkRtspUrl,
  viewerUrlForCamera,
};

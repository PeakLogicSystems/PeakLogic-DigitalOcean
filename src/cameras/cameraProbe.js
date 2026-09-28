'use strict';

const { probeOnvifDevice } = require('./onvifClient');
const {
  reolinkOnvifCandidates,
  isReolinkDevice,
  normalizeReolinkRtspUrl,
  viewerUrlForCamera,
} = require('./reolink');
const { syncCamera: syncGo2rtcStream } = require('./go2rtcManager');
const {
  checkRtspReachability,
  invalidateReachabilityCache,
  parseRtspTarget,
} = require('./cameraReachability');

function isAuthError(err) {
  const msg = String(err?.message || err || '');
  return /\b401\b|unauthorized|digest|authentication|auth(enticat)?(e|ion)? (failed|required)/i.test(msg);
}

function isConnectError(err) {
  const msg = String(err?.message || err || '');
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|timeout/i.test(msg);
}

async function tryProbeUrls(urls, creds, opts) {
  let lastErr = null;
  let authErr = null;
  for (const url of urls) {
    try {
      const result = await probeOnvifDevice(url, creds, opts);
      return { ...result, onvifUrl: url };
    } catch (e) {
      lastErr = e;
      if (isAuthError(e)) {
        authErr = e;
        // Wrong credentials on a reachable ONVIF endpoint — don't bury under later ECONNREFUSED.
        break;
      }
    }
  }
  if (authErr) throw authErr;
  if (lastErr) throw lastErr;
  throw new Error('No ONVIF endpoints to probe');
}

function probeUrlsForCamera(camera) {
  const urls = [];
  const push = (url) => {
    const u = String(url || '').trim();
    if (u && !urls.includes(u)) urls.push(u);
  };
  push(camera.onvifUrl);
  const host = String(camera.host || '').trim();
  const port = Number(camera.port) || 0;
  // If inventory already points at a Reolink ONVIF port, probe that first and skip port-80 chaff.
  if (host && (camera.vendor === 'reolink' || port === 8000 || /:8000\b/.test(camera.onvifUrl || ''))) {
    push(`http://${host}:8000/onvif/device_service`);
    return urls;
  }
  for (const url of reolinkOnvifCandidates(host)) push(url);
  return urls;
}

/**
 * Full ONVIF probe for an inventory camera. Tries multiple endpoints (Reolink :8000).
 * @param {object} camera registry record with credentials
 * @param {{ preferSubstream?: boolean, rtspPort?: number, apiBase?: string }} [opts]
 */
async function probeCamera(camera, opts = {}) {
  const creds = {
    username: camera.username || opts.username || '',
    password: camera.password || opts.password || '',
    timeoutMs: opts.timeoutMs || 12000,
  };
  const preferSubstream = opts.preferSubstream !== false;
  const urls = probeUrlsForCamera(camera);

  let probe;
  try {
    probe = await tryProbeUrls(urls, creds, { preferSubstream });
  } catch (e) {
    return {
      ok: false,
      error: e.message || String(e),
      probedAt: new Date().toISOString(),
    };
  }

  const reolink = isReolinkDevice(probe) || isReolinkDevice(camera) || camera.vendor === 'reolink';
  const { host } = camera;
  let rtspUrl = probe.rtspUrl || camera.rtspUrl || '';
  if (reolink) {
    rtspUrl = normalizeReolinkRtspUrl(rtspUrl, {
      host,
      username: creds.username,
      password: creds.password,
      preferSubstream,
      rtspPort: opts.rtspPort || 554,
    });
  }

  const cameraId = camera.cameraId;
  const settings = opts.settings || {};
  const preferGo2rtc = settings.go2rtcEnabled !== false
    && (settings.streamBackend || 'go2rtc') === 'go2rtc'
    && !!rtspUrl;

  let viewerUrl = camera.viewerUrl || '';
  let go2rtcSync = '';
  let go2rtcError = '';

  if (preferGo2rtc) {
    const rtspTarget = parseRtspTarget(rtspUrl, camera, settings);
    invalidateReachabilityCache(rtspTarget.host, rtspTarget.port);
    const reach = await checkRtspReachability(rtspUrl, camera, settings);
    if (!reach.ok) {
      go2rtcSync = 'skipped';
      go2rtcError = reach.error || 'RTSP endpoint unreachable';
      if (probe.snapshotUrl || rtspUrl) {
        viewerUrl = viewerUrlForCamera(cameraId, { basePath: opts.apiBase || '/api', backend: 'mjpeg' });
      }
    } else {
      try {
        await syncGo2rtcStream(cameraId, rtspUrl, settings, camera);
        viewerUrl = viewerUrlForCamera(cameraId, { basePath: opts.apiBase || '/api', backend: 'go2rtc' });
        go2rtcSync = 'ok';
      } catch (e) {
        go2rtcSync = e.skipped ? 'skipped' : 'failed';
        go2rtcError = e.message || String(e);
        if (probe.snapshotUrl || rtspUrl) {
          viewerUrl = viewerUrlForCamera(cameraId, { basePath: opts.apiBase || '/api', backend: 'mjpeg' });
        }
      }
    }
  } else if (probe.snapshotUrl || rtspUrl) {
    viewerUrl = viewerUrlForCamera(cameraId, { basePath: opts.apiBase || '/api', backend: 'mjpeg' });
  }

  return {
    ok: true,
    probedAt: new Date().toISOString(),
    vendor: reolink ? 'reolink' : (camera.vendor || ''),
    onvifUrl: probe.onvifUrl || camera.onvifUrl,
    mediaUrl: probe.mediaUrl || '',
    eventsUrl: probe.eventsUrl || camera.eventsUrl || '',
    manufacturer: probe.manufacturer || camera.manufacturer || '',
    model: probe.model || camera.model || '',
    firmware: probe.firmware || camera.firmware || '',
    serial: probe.serial || '',
    profileToken: probe.profileToken || '',
    profiles: probe.profiles || [],
    rtspUrl,
    snapshotUrl: probe.snapshotUrl || '',
    viewerUrl,
    go2rtcSync,
    go2rtcError,
    onvifProfile: probe.profiles?.length ? 'T' : (camera.onvifProfile || ''),
    name: probe.name || camera.name,
  };
}

function applyProbeToRecord(camera, probe) {
  if (!probe?.ok) {
    return {
      ...camera,
      probeStatus: 'error',
      probeError: probe?.error || 'Probe failed',
      probedAt: probe?.probedAt || new Date().toISOString(),
    };
  }
  return {
    ...camera,
    vendor: probe.vendor || camera.vendor,
    onvifUrl: probe.onvifUrl || camera.onvifUrl,
    mediaUrl: probe.mediaUrl || camera.mediaUrl || '',
    eventsUrl: probe.eventsUrl || camera.eventsUrl || '',
    manufacturer: probe.manufacturer || camera.manufacturer,
    model: probe.model || camera.model,
    firmware: probe.firmware || camera.firmware,
    serial: probe.serial || camera.serial || '',
    profileToken: probe.profileToken || camera.profileToken || '',
    rtspUrl: probe.rtspUrl || camera.rtspUrl,
    snapshotUrl: probe.snapshotUrl || camera.snapshotUrl || '',
    viewerUrl: probe.viewerUrl || camera.viewerUrl,
    onvifProfile: probe.onvifProfile || camera.onvifProfile,
    name: camera.name || probe.name,
    probeStatus: 'ok',
    probeError: '',
    probedAt: probe.probedAt,
    lastSeenAt: probe.probedAt,
  };
}

module.exports = {
  probeCamera,
  applyProbeToRecord,
  probeUrlsForCamera,
  tryProbeUrls,
};

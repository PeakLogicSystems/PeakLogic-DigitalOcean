'use strict';

const http = require('http');

function go2rtcBaseUrl(port = 1984, host = '127.0.0.1') {
  return `http://${host}:${port}`;
}

function requestJson(url, { method = 'GET', timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: `${u.pathname}${u.search}`,
      method,
      headers: { Accept: 'application/json' },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = text;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }
        resolve({ status: res.statusCode || 0, body, headers: res.headers });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(Object.assign(new Error('go2rtc request timeout'), { code: 'ETIMEDOUT' }));
    });
    req.on('error', reject);
    req.end();
  });
}

function requestBinary(url, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: `${u.pathname}${u.search}`,
      method: 'GET',
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode }));
          return;
        }
        resolve({
          buffer,
          contentType: String(res.headers['content-type'] || 'image/jpeg').split(';')[0].trim(),
        });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('go2rtc frame timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchFrameJpeg(cameraId, settings = {}) {
  const port = Number(settings.go2rtcPort) || 1984;
  const host = '127.0.0.1';
  const name = encodeURIComponent(streamNameForCamera(cameraId));
  const url = `${go2rtcBaseUrl(port, host)}/api/frame.jpeg?src=${name}`;
  return requestBinary(url, { timeoutMs: 12000 });
}

async function ping(port = 1984, host = '127.0.0.1') {
  try {
    const res = await requestJson(`${go2rtcBaseUrl(port, host)}/api`);
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

async function listStreams(port = 1984, host = '127.0.0.1') {
  const res = await requestJson(`${go2rtcBaseUrl(port, host)}/api/streams`);
  if (res.status < 200 || res.status >= 300) {
    throw Object.assign(new Error(`go2rtc list streams failed (${res.status})`), { status: res.status });
  }
  return res.body && typeof res.body === 'object' ? res.body : {};
}

async function putStream(name, src, { port = 1984, host = '127.0.0.1' } = {}) {
  // go2rtc ≥1.9: PUT /api/streams?name=<id>&src=<rtsp>
  // (older docs used "dst"; that param is ignored and the stream was named after the RTSP URL)
  const streamName = encodeURIComponent(name);
  const source = encodeURIComponent(src);
  const url = `${go2rtcBaseUrl(port, host)}/api/streams?name=${streamName}&src=${source}`;
  const res = await requestJson(url, { method: 'PUT' });
  if (res.status < 200 || res.status >= 300) {
    throw Object.assign(new Error(`go2rtc put stream failed (${res.status})`), { status: res.status, body: res.body });
  }
  return res.body;
}

async function deleteStream(name, src, { port = 1984, host = '127.0.0.1' } = {}) {
  // go2rtc ≥1.9: DELETE /api/streams?src=<stream-name>
  const streamName = encodeURIComponent(name);
  let url = `${go2rtcBaseUrl(port, host)}/api/streams?src=${streamName}`;
  if (src && src !== name) url += `&name=${streamName}`;
  const res = await requestJson(url, { method: 'DELETE' });
  if (res.status < 200 || res.status >= 300) {
    throw Object.assign(new Error(`go2rtc delete stream failed (${res.status})`), { status: res.status });
  }
  return res.body;
}

function streamNameForCamera(cameraId) {
  return String(cameraId || '').trim();
}

function playerPagePath(cameraId, basePath = '/api') {
  return `${basePath}/cameras/${encodeURIComponent(cameraId)}/player`;
}

function proxyBasePath(basePath = '/api') {
  return `${basePath}/go2rtc`;
}

function renderPlayerHtml(cameraId, { proxyBase = '/api/go2rtc' } = {}) {
  const name = streamNameForCamera(cameraId);
  const base = proxyBase.replace(/\/$/, '');
  // Must load video-stream.js (defines <video-stream>) and set src to the go2rtc
  // WebSocket endpoint — a bare stream name never connects (blank player / spinning Open).
  const wsPath = `${base}/api/ws?src=${encodeURIComponent(name)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Camera ${name}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0a0a0a; overflow: hidden; }
    video-stream { display: block; width: 100%; height: 100%; }
  </style>
  <script type="module" src="${base}/video-stream.js"></script>
</head>
<body>
  <script type="module">
    const el = document.createElement('video-stream');
    el.background = true;
    el.mode = 'webrtc,mse,hls,mjpeg';
    el.src = new URL(${JSON.stringify(wsPath)}, location.href);
    document.body.appendChild(el);
  </script>
</body>
</html>`;
}

function renderPlayerSetupHtml(cameraId, message) {
  const name = streamNameForCamera(cameraId);
  const text = String(message || 'Camera stream is not ready.').trim();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Camera ${name}</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #0a0a0a; color: #e2e8f0; font: 14px/1.5 system-ui, sans-serif; }
    .wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; box-sizing: border-box; }
    .panel { max-width: 36rem; background: #111827; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 1.25rem 1.5rem; }
    h1 { margin: 0 0 .75rem; font-size: 1.1rem; font-weight: 600; }
    p { margin: 0 0 .75rem; color: #cbd5e1; }
    ol { margin: 0; padding-left: 1.25rem; color: #94a3b8; }
    li + li { margin-top: .35rem; }
    code { color: #f8fafc; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h1>Camera not streaming</h1>
      <p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      <ol>
        <li>Enable <strong>ONVIF</strong> on the camera (Reolink: Settings → Network → Advanced → Port Settings, port 8000).</li>
        <li>In PeakLogic: <strong>Cameras → Administration… → Inventory → Probe</strong> for <code>${name}</code>.</li>
        <li>Confirm credentials in Cameras → Settings, then use <strong>Sync streams to go2rtc</strong>.</li>
      </ol>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  go2rtcBaseUrl,
  ping,
  listStreams,
  putStream,
  deleteStream,
  streamNameForCamera,
  playerPagePath,
  proxyBasePath,
  renderPlayerHtml,
  renderPlayerSetupHtml,
  fetchFrameJpeg,
  requestBinary,
};

'use strict';

const { fetchSnapshot, getSnapshotUri } = require('./onvifClient');

const BOUNDARY = 'peaklogic-mjpeg';

async function resolveSnapshotUrl(camera, creds) {
  if (camera.snapshotUrl) return camera.snapshotUrl;
  if (camera.mediaUrl && camera.profileToken) {
    return getSnapshotUri(camera.mediaUrl, camera.profileToken, creds);
  }
  return '';
}

/**
 * Stream multipart MJPEG to an HTTP response using ONVIF GetSnapshotUri polling.
 * @param {object} camera full registry record
 * @param {import('http').ServerResponse} res
 * @param {{ intervalMs?: number, req?: import('http').IncomingMessage }} [opts]
 */
async function streamCameraMjpeg(camera, res, opts = {}) {
  const creds = {
    username: camera.username || '',
    password: camera.password || '',
    timeoutMs: 10000,
  };
  const snapshotUrl = await resolveSnapshotUrl(camera, creds);
  if (!snapshotUrl) {
    const err = new Error('Camera has no snapshot URI — run Probe first with valid credentials');
    err.status = 503;
    throw err;
  }

  const intervalMs = Math.max(100, Number(opts.intervalMs) || 200);
  let closed = false;
  opts.req?.on('close', () => { closed = true; });

  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Connection: 'close',
  });

  while (!closed && !res.writableEnded) {
    try {
      const snap = await fetchSnapshot(snapshotUrl, creds);
      res.write(`--${BOUNDARY}\r\nContent-Type: ${snap.contentType}\r\nContent-Length: ${snap.buffer.length}\r\n\r\n`);
      res.write(snap.buffer);
      res.write('\r\n');
    } catch {
      // skip bad frame; keep stream alive
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

module.exports = {
  streamCameraMjpeg,
  resolveSnapshotUrl,
  BOUNDARY,
};

'use strict';

const { sha256Buffer } = require('./zstdWriter');

function archiveServerConfig() {
  const baseUrl = String(process.env.ARCHIVE_SERVER_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.ARCHIVE_SERVER_TOKEN || '').trim();
  return { baseUrl, token };
}

function archiveEnabled() {
  return !!archiveServerConfig().baseUrl;
}

function headers(token, extra = {}) {
  const h = { ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function putArchive(relativePath, body, { contentType = 'application/octet-stream' } = {}) {
  const { baseUrl, token } = archiveServerConfig();
  if (!baseUrl) throw new Error('ARCHIVE_SERVER_URL not configured');

  const url = `${baseUrl}/archive/${relativePath.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(token, {
      'Content-Type': contentType,
      'X-SHA256': sha256Buffer(Buffer.isBuffer(body) ? body : Buffer.from(body)),
    }),
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`archive PUT ${relativePath} failed: ${res.status} ${text}`);
  }

  return { ok: true, path: relativePath, status: res.status };
}

async function headArchive(relativePath) {
  const { baseUrl, token } = archiveServerConfig();
  if (!baseUrl) throw new Error('ARCHIVE_SERVER_URL not configured');

  const url = `${baseUrl}/archive/${relativePath.replace(/^\/+/, '')}`;
  const res = await fetch(url, { method: 'HEAD', headers: headers(token) });
  if (!res.ok) {
    throw new Error(`archive HEAD ${relativePath} failed: ${res.status}`);
  }

  return {
    ok: true,
    contentLength: Number(res.headers.get('content-length') || 0),
    sha256: String(res.headers.get('x-sha256') || '').toLowerCase(),
  };
}

async function verifyArchive(relativePath, expectedSha256, expectedSize) {
  const meta = await headArchive(relativePath);
  if (expectedSize != null && meta.contentLength !== expectedSize) {
    throw new Error(`size mismatch ${relativePath}: ${meta.contentLength} != ${expectedSize}`);
  }
  if (expectedSha256 && meta.sha256 && meta.sha256 !== expectedSha256.toLowerCase()) {
    throw new Error(`sha256 mismatch ${relativePath}`);
  }
  return meta;
}

module.exports = {
  archiveEnabled,
  archiveServerConfig,
  putArchive,
  headArchive,
  verifyArchive,
};

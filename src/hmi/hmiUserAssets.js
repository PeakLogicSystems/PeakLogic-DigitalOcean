'use strict';

const fs = require('fs');
const path = require('path');

const USER_HMI_WEB_PREFIX = '/hmi/user/';
const USER_HMI_GROUP = 'User imports';
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXT = new Set(['svg', 'png', 'gif', 'jpg', 'jpeg', 'webp']);

function userImportsDir(dataDir) {
  return path.join(dataDir, 'hmi-imports');
}

function ensureUserImportsDir(dataDir) {
  const dir = userImportsDir(dataDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeImportFilename(name) {
  const base = path.basename(String(name || '').trim());
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  const ext = path.extname(cleaned).slice(1).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return cleaned;
}

function webPathForUserFile(filename) {
  return `${USER_HMI_WEB_PREFIX}${filename.split('/').map((p) => encodeURIComponent(p)).join('/')}`;
}

function listUserHmiAssets(dataDir) {
  const dir = userImportsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (!fs.statSync(fp).isFile()) continue;
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;
    const label = name.replace(/\.(svg|gif|png|jpe?g|webp)$/i, '').replace(/[_-]+/g, ' ');
    out.push({
      path: webPathForUserFile(name),
      name,
      type: ext,
      group: USER_HMI_GROUP,
      subgroup: 'overlays',
      vendor: 'user',
      label,
      userImport: true,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function saveUserHmiAsset(dataDir, filename, buffer) {
  const safe = sanitizeImportFilename(filename);
  if (!safe) return { ok: false, error: 'Invalid filename — use .svg, .png, .gif, .jpg, or .webp' };
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!buf.length) return { ok: false, error: 'Empty file' };
  if (buf.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: `File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)` };
  }
  const dir = ensureUserImportsDir(dataDir);
  const fp = path.join(dir, safe);
  fs.writeFileSync(fp, buf);
  const asset = listUserHmiAssets(dataDir).find((a) => a.name === safe);
  return { ok: true, asset, path: asset?.path || webPathForUserFile(safe) };
}

module.exports = {
  USER_HMI_WEB_PREFIX,
  USER_HMI_GROUP,
  MAX_IMPORT_BYTES,
  userImportsDir,
  ensureUserImportsDir,
  sanitizeImportFilename,
  listUserHmiAssets,
  saveUserHmiAsset,
};

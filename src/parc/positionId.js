'use strict';

const { isAteccDeviceId } = require('./optaSerial');

const POSITION_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;

function normalizePositionId(id) {
  const s = String(id || '').trim();
  if (!s) throw Object.assign(new Error('position ID required'), { status: 400 });
  if (!POSITION_ID_RE.test(s)) {
    throw Object.assign(new Error('position ID must be 1-64 chars: letters, digits, . _ -'), { status: 400 });
  }
  return s;
}

/** True when driver id equals ATECC SN device id (legacy SN-as-position). */
function isSnBasedPositionId(id) {
  return isAteccDeviceId(String(id || '').trim());
}

function slugifyPositionName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/** Suggest a stable infrastructure name from registry metadata. */
function suggestPositionId(registryDev, deviceId) {
  const name = String(registryDev?.name || '').trim();
  if (name && name !== deviceId && !isAteccDeviceId(name)) {
    const slug = slugifyPositionName(name);
    if (slug) return slug;
  }
  const sn = registryDev?.ateccSerial || registryDev?.meta?.ateccSerial || '';
  if (sn.length >= 6) return `io_${sn.slice(-6).toLowerCase()}`;
  const ip = registryDev?.meta?.ethIp || registryDev?.attachHost;
  if (ip) return `io_${String(ip).replace(/\./g, '_')}`;
  return null;
}

function nextAutoPositionId(prefix, start, pad, existingIds) {
  const base = String(prefix || 'io').trim() || 'io';
  let n = Number.isFinite(start) ? start : 1;
  const width = Math.max(0, Number(pad) || 0);
  for (let guard = 0; guard < 10000; guard += 1) {
    const suffix = width > 0 ? String(n).padStart(width, '0') : String(n);
    const candidate = normalizePositionId(`${base}_${suffix}`);
    if (!existingIds.has(candidate)) return candidate;
    n += 1;
  }
  throw Object.assign(new Error('Could not allocate position ID'), { status: 500 });
}

module.exports = {
  normalizePositionId,
  isSnBasedPositionId,
  slugifyPositionName,
  suggestPositionId,
  nextAutoPositionId,
};

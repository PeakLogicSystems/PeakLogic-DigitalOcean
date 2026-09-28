'use strict';

const { randomUUID } = require('crypto');
const persistence = require('../persistence');
const {
  normalizeProfile,
  defaultProfile,
} = require('./userProfileSchema');

const FILE = 'users.json';

function now() {
  return new Date().toISOString();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role || 'operator',
    active: row.active !== false,
    profile: row.profile,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadRows() {
  const list = persistence.readJson(FILE, null);
  if (Array.isArray(list) && list.length) return list;
  const seed = {
    id: randomUUID(),
    email: 'operator@local',
    role: 'admin',
    active: true,
    profile: defaultProfile('operator@local'),
    createdAt: now(),
    updatedAt: now(),
  };
  persistence.writeJson(FILE, [seed]);
  return [seed];
}

function saveRows(rows) {
  persistence.writeJson(FILE, rows);
}

function listUsers() {
  return loadRows().map(publicUser);
}

function getUser(id) {
  const row = loadRows().find((u) => u.id === id);
  return publicUser(row);
}

function createUser(input) {
  const email = String(input.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, status: 400, error: 'Valid email is required' };
  }
  const rows = loadRows();
  if (rows.some((u) => u.email === email)) {
    return { ok: false, status: 409, error: 'Email already in use' };
  }
  const ts = now();
  const row = {
    id: randomUUID(),
    email,
    role: ['admin', 'operator', 'viewer'].includes(input.role) ? input.role : 'operator',
    active: input.active !== false,
    profile: normalizeProfile(input.profile, { email }),
    createdAt: ts,
    updatedAt: ts,
  };
  rows.push(row);
  saveRows(rows);
  return { ok: true, user: publicUser(row) };
}

function updateUser(id, input) {
  const rows = loadRows();
  const idx = rows.findIndex((u) => u.id === id);
  if (idx < 0) return { ok: false, status: 404, error: 'User not found' };
  const cur = rows[idx];
  const email = input.email != null ? String(input.email).trim().toLowerCase() : cur.email;
  if (!email || !email.includes('@')) {
    return { ok: false, status: 400, error: 'Valid email is required' };
  }
  if (rows.some((u, i) => i !== idx && u.email === email)) {
    return { ok: false, status: 409, error: 'Email already in use' };
  }
  const next = { ...cur, email, updatedAt: now() };
  if (input.role != null && ['admin', 'operator', 'viewer'].includes(input.role)) {
    next.role = input.role;
  }
  if (input.active != null) next.active = !!input.active;
  if (input.profile != null) {
    next.profile = normalizeProfile(input.profile, { email });
  }
  rows[idx] = next;
  saveRows(rows);
  return { ok: true, user: publicUser(next) };
}

function deleteUser(id) {
  const rows = loadRows();
  if (rows.length <= 1) {
    return { ok: false, status: 403, error: 'Cannot delete the last user profile' };
  }
  const next = rows.filter((u) => u.id !== id);
  if (next.length === rows.length) return { ok: false, status: 404, error: 'User not found' };
  saveRows(next);
  return { ok: true };
}

function listNotificationRecipients(alarmLevel, alarmContext = null) {
  const { shouldNotifyForLevel, isWithinQuietHours, matchesNotificationScope } = require('./userProfileSchema');
  const ctx = alarmContext && typeof alarmContext === 'object' ? alarmContext : {};
  return loadRows()
    .filter((u) => u.active !== false)
    .filter((u) => shouldNotifyForLevel(u.profile?.alarmNotifications, alarmLevel))
    .filter((u) => matchesNotificationScope(u.profile?.alarmNotifications, ctx))
    .filter((u) => !isWithinQuietHours(u.profile?.alarmNotifications))
    .map(publicUser);
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  listNotificationRecipients,
  publicUser,
};

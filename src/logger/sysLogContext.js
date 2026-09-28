'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithContext(ctx, fn) {
  return storage.run(ctx || {}, fn);
}

function getContext() {
  return storage.getStore() || {};
}

function mergeContext(patch) {
  const cur = getContext();
  return { ...cur, ...(patch || {}) };
}

/** Cloud gateway / auth middleware attaches user on req; normalize for syslog. */
function userFromRequest(req) {
  if (!req || typeof req !== 'object') return null;
  if (req.peaklogicUser && typeof req.peaklogicUser === 'object') {
    const u = req.peaklogicUser;
    return {
      id: String(u.id || u.userId || '').trim() || null,
      email: String(u.email || '').trim() || null,
      name: String(u.name || u.displayName || '').trim() || null,
      role: String(u.role || '').trim() || null,
    };
  }
  const h = req.headers || {};
  const id = String(h['x-peaklogic-user-id'] || h['x-user-id'] || '').trim();
  const email = String(h['x-peaklogic-user-email'] || h['x-user-email'] || '').trim();
  const name = String(h['x-peaklogic-user-name'] || '').trim();
  const role = String(h['x-peaklogic-user-role'] || '').trim();
  if (!id && !email && !name) return null;
  return {
    id: id || null,
    email: email || null,
    name: name || null,
    role: role || null,
  };
}

module.exports = {
  runWithContext,
  getContext,
  mergeContext,
  userFromRequest,
};

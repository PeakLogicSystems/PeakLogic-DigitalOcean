'use strict';

const crypto = require('crypto');
const { TOKEN_TTL_MS } = require('./nextcenturyAuth');

const SESSION_TTL_MS = 5 * 60 * 1000;
const sessions = new Map();

function pruneSessions() {
  const now = Date.now();
  for (const [id, row] of sessions) {
    if (row.expiresAt <= now) sessions.delete(id);
  }
}

function createPortalSession({ token, email, driverId }) {
  pruneSessions();
  const id = crypto.randomBytes(18).toString('base64url');
  const now = Date.now();
  const row = {
    token: String(token),
    email: String(email || ''),
    driverId: driverId ? String(driverId) : '',
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    tokenExpiresAt: now + TOKEN_TTL_MS,
    consumed: false,
  };
  sessions.set(id, row);
  return { sessionId: id, expiresAt: row.expiresAt };
}

function getPortalSession(sessionId) {
  pruneSessions();
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const row = sessions.get(id);
  if (!row || row.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return row;
}

function consumePortalSession(sessionId) {
  const row = getPortalSession(sessionId);
  if (!row) return null;
  row.consumed = true;
  return row;
}

function clearPortalSessionsForTests() {
  sessions.clear();
}

module.exports = {
  SESSION_TTL_MS,
  createPortalSession,
  getPortalSession,
  consumePortalSession,
  clearPortalSessionsForTests,
};

'use strict';

const AUTH_URL = 'https://api.nextcenturymeters.com/login';
const PORTAL_BASE_URL = 'https://app.nextcenturymeters.com';
const DEFAULT_TIMEOUT_MS = 15000;
const TOKEN_TTL_MS = 55 * 60 * 1000;

function resolveCredentials(cfg) {
  const email = String(cfg?.email || process.env.NEXTCENTURY_EMAIL || '').trim();
  const password = String(cfg?.password || process.env.NEXTCENTURY_PASSWORD || '');
  if (!email || !password) {
    throw new Error('NextCentury email and password required (driver config or NEXTCENTURY_* env)');
  }
  return { email, password };
}

async function loginNextcentury(credentials, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { email, password } = credentials;
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`NextCentury login HTTP ${res.status}`);
  const data = await res.json();
  const token = data.token || data.access_token;
  if (!token) throw new Error('NextCentury login: no token');
  return {
    token: String(token),
    email,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
}

/**
 * Build the NextCentury web portal URL for iframe navigation.
 * Uses a hash route handoff — the SPA may still show login if it does not honor this param.
 */
function buildPortalUrl(token, { baseUrl = PORTAL_BASE_URL } = {}) {
  const base = String(baseUrl || PORTAL_BASE_URL).replace(/\/$/, '');
  const t = encodeURIComponent(String(token || ''));
  return `${base}/#/login?token=${t}`;
}

function buildPortalLoginUrl({ baseUrl = PORTAL_BASE_URL } = {}) {
  const base = String(baseUrl || PORTAL_BASE_URL).replace(/\/$/, '');
  return `${base}/login`;
}

module.exports = {
  AUTH_URL,
  PORTAL_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  TOKEN_TTL_MS,
  resolveCredentials,
  loginNextcentury,
  buildPortalUrl,
  buildPortalLoginUrl,
};

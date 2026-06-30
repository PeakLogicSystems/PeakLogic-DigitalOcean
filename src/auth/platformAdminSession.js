'use strict';

const crypto = require('crypto');
const { PLATFORM_ADMIN_KEY, JWT_SECRET } = require('../config');
const { baseCookieOptions } = require('./cookieOptions');

const COOKIE_NAME = 'mv_platform_admin';
const SESSION_MS = 24 * 60 * 60 * 1000;

function deriveSessionToken() {
  if (!PLATFORM_ADMIN_KEY) return null;
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`platform-admin:${PLATFORM_ADMIN_KEY}`)
    .digest('hex');
}

function isValidPlatformAdminSession(value) {
  const expected = deriveSessionToken();
  if (!expected || !value) return false;
  try {
    const a = Buffer.from(String(value));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function setPlatformAdminCookie(res, req) {
  const token = deriveSessionToken();
  if (!token) return;
  res.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions(req),
    maxAge: SESSION_MS,
    path: '/admin',
  });
}

function clearPlatformAdminCookie(res, req) {
  res.clearCookie(COOKIE_NAME, {
    ...baseCookieOptions(req),
    path: '/admin',
  });
}

function getPlatformAdminCookie(req) {
  return req.cookies?.[COOKIE_NAME] || '';
}

module.exports = {
  COOKIE_NAME,
  deriveSessionToken,
  isValidPlatformAdminSession,
  setPlatformAdminCookie,
  clearPlatformAdminCookie,
  getPlatformAdminCookie,
};

'use strict';

const { JWT_EXPIRES_IN } = require('../config');
const { baseCookieOptions } = require('./cookieOptions');

const COOKIE_NAME = 'mv_token';

/** Parse JWT_EXPIRES_IN (e.g. 7d, 24h) to cookie maxAge ms. */
function jwtExpiresToMs(expiresIn) {
  const match = /^(\d+)([dhms])?$/.exec(String(expiresIn || '7d').trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  switch (match[2] || 'd') {
    case 'd': return n * 24 * 60 * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'm': return n * 60 * 1000;
    case 's': return n * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) return match[1].trim();
  return req.cookies?.[COOKIE_NAME] || '';
}

function setAuthCookie(res, token, req) {
  res.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions(req),
    maxAge: jwtExpiresToMs(JWT_EXPIRES_IN),
    path: '/',
  });
}

function clearAuthCookie(res, req) {
  res.clearCookie(COOKIE_NAME, {
    ...baseCookieOptions(req),
    path: '/',
  });
}

module.exports = {
  COOKIE_NAME,
  getTokenFromRequest,
  setAuthCookie,
  clearAuthCookie,
};

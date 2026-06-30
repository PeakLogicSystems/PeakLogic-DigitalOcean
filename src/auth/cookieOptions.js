'use strict';

/**
 * Whether auth cookies should use the Secure flag.
 * Default: match the incoming request (requires app.set('trust proxy')).
 * Override with COOKIE_SECURE=true|false in env.
 */
function cookieSecure(req) {
  const env = process.env.COOKIE_SECURE;
  if (env === 'true') return true;
  if (env === 'false') return false;
  if (req && typeof req.secure === 'boolean') return req.secure;
  return false;
}

function baseCookieOptions(req) {
  return {
    httpOnly: true,
    secure: cookieSecure(req),
    sameSite: 'lax',
  };
}

module.exports = { cookieSecure, baseCookieOptions };

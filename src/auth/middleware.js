'use strict';

const { verifyToken } = require('./jwt');
const { getTokenFromRequest } = require('./webSession');
const {
  isValidPlatformAdminSession,
  getPlatformAdminCookie,
} = require('./platformAdminSession');
const { PLATFORM_ADMIN_KEY } = require('../config');
const tenantService = require('../services/tenantService');
const { publicCmmsEntitlement } = require('../tenants/cmmsEntitlement');

function attachAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return next();
  try {
    const claims = verifyToken(token);
    req.auth = {
      userId: claims.userId,
      tenantId: claims.tenantId,
      role: claims.role,
      email: claims.email,
    };
  } catch {
    /* invalid or expired — treat as unauthenticated */
  }
  return next();
}

function authenticate(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const claims = verifyToken(token);
    req.auth = {
      userId: claims.userId,
      tenantId: claims.tenantId,
      role: claims.role,
      email: claims.email,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireWebAuth(req, res, next) {
  if (req.auth) return next();
  return res.redirect('/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

function extractPlatformAdminKey(req) {
  const header = req.headers['x-platform-admin-key'];
  if (header) return String(header).trim();
  const auth = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : '';
}

function isPlatformAdminAuthorized(req) {
  if (!PLATFORM_ADMIN_KEY) return false;
  const key = extractPlatformAdminKey(req);
  if (key && key === PLATFORM_ADMIN_KEY) return true;
  return isValidPlatformAdminSession(getPlatformAdminCookie(req));
}

function attachPlatformAdmin(req, res, next) {
  if (isPlatformAdminAuthorized(req)) {
    req.platformAdmin = true;
  }
  return next();
}

function requirePlatformAdmin(req, res, next) {
  if (!PLATFORM_ADMIN_KEY) {
    return res.status(503).json({ error: 'Control Center API is not configured' });
  }
  if (!isPlatformAdminAuthorized(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  req.platformAdmin = true;
  return next();
}

function requirePlatformAdminWeb(req, res, next) {
  if (!PLATFORM_ADMIN_KEY) {
    return res.status(503).send('Control Center is not configured (set PLATFORM_ADMIN_KEY).');
  }
  if (!isPlatformAdminAuthorized(req)) {
    return res.redirect('/admin/login');
  }
  req.platformAdmin = true;
  return next();
}

function isPlatformAdminRequest(req) {
  return isPlatformAdminAuthorized(req);
}

async function requireCmmsEntitlement(req, res, next) {
  if (!req.auth?.tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const cmms = await tenantService.getTenantCmmsEntitlement(req.auth.tenantId);
  if (!cmms?.enabled) {
    return res.status(403).json({ error: 'CMMS is not enabled for this tenant' });
  }
  req.tenantCmms = publicCmmsEntitlement(cmms);
  return next();
}

module.exports = {
  attachAuth,
  authenticate,
  requireWebAuth,
  requireRole,
  attachPlatformAdmin,
  requirePlatformAdmin,
  requirePlatformAdminWeb,
  isPlatformAdminRequest,
  isPlatformAdminAuthorized,
  requireCmmsEntitlement,
};

'use strict';

const { isCloudDeployment } = require('../cloud/agentProtocol');
const { tenantStore } = require('../tenants/tenantStore');
const { applianceAuthStore } = require('../auth/applianceAuthStore');
const { isPartnerHomeSession } = require('./partnerAccess');

const COOKIE = 'mv_session';

function readCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(raw);
  return m ? decodeURIComponent(m[1]) : '';
}

function extractToken(req) {
  const hdr = String(req.headers.authorization || '');
  if (hdr.startsWith('Bearer ')) return hdr.slice(7).trim();
  const q = String(req.query.token || '').trim();
  if (q) return q;
  return readCookie(req, COOKIE);
}

function sessionFromToken(token) {
  if (isCloudDeployment()) return tenantStore.sessionFromToken(token);
  return applianceAuthStore.sessionFromToken(token);
}

function logoutToken(token) {
  if (isCloudDeployment()) return tenantStore.logout(token);
  return applianceAuthStore.logout(token);
}

function attachPeaklogicUser(req) {
  if (!req.mvAuth?.user) return;
  const u = req.mvAuth.user;
  req.peaklogicUser = {
    id: u.userId || u.id,
    email: u.email,
    name: u.name,
    role: u.role,
  };
}

function attachSession(req, res, next) {
  const token = extractToken(req);
  const sess = sessionFromToken(token);
  req.mvAuth = sess;
  req.mvToken = token || null;
  attachPeaklogicUser(req);
  next();
}

function requireAuth(req, res, next) {
  if (!req.mvAuth) {
    const apiRequest = String(req.originalUrl || req.url || '').startsWith('/api/')
      || req.path.startsWith('/auth/')
      || (req.headers.accept || '').includes('application/json')
      || String(req.headers['content-type'] || '').includes('application/json');
    if (apiRequest) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const nextUrl = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/login?next=${nextUrl}`);
  }
  next();
}

function requirePlatformAdmin(req, res, next) {
  if (!req.mvAuth || req.mvAuth.user.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Platform admin required' });
  }
  next();
}

function requireApplianceAdmin(req, res, next) {
  if (!req.mvAuth?.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.mvAuth.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin required' });
  }
  next();
}

function requireTenantAccess(req, res, next) {
  if (!req.mvAuth) return res.status(401).json({ error: 'Authentication required' });
  if (req.mvAuth.user.role === 'platform_admin') return next();
  if (!req.mvAuth.tenant) return res.status(403).json({ error: 'No tenant context' });
  next();
}

function activeTenantId(req) {
  if (!req.mvAuth) return null;
  if (req.mvAuth.tenant?.tenantId) return req.mvAuth.tenant.tenantId;
  return req.mvAuth.user.tenantId || null;
}

function isPartnerHome(req) {
  if (!req.mvAuth?.user) return false;
  return isPartnerHomeSession(req.mvAuth.user, activeTenantId(req));
}

function setSessionCookie(res, token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

module.exports = {
  COOKIE,
  attachSession,
  requireAuth,
  requirePlatformAdmin,
  requireApplianceAdmin,
  requireTenantAccess,
  activeTenantId,
  isPartnerHome,
  setSessionCookie,
  clearSessionCookie,
  extractToken,
  sessionFromToken,
  logoutToken,
  attachPeaklogicUser,
};

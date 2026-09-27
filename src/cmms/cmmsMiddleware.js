'use strict';

const { asyncHandler } = require('../util/http');
const { attachAuth, requireWebAuth } = require('../auth/middleware');
const authService = require('../services/authService');
const tenantService = require('../services/tenantService');
const { publicCmmsEntitlement } = require('../tenants/cmmsEntitlement');
const { buildCmmsUser, canAccess } = require('./cmmsRoles');

function requireCmmsWeb(minRole) {
  return (req, res, next) => {
    if (!canAccess(minRole, req.auth?.role)) {
      return res.status(403).send('Insufficient permissions for this CMMS action.');
    }
    return next();
  };
}

const cmmsContext = asyncHandler(async (req, res, next) => {
  const cmms = await tenantService.getTenantCmmsEntitlement(req.auth.tenantId);
  if (!cmms?.enabled) {
    return res.redirect('/?cmms=disabled');
  }
  const [user, tenant] = await Promise.all([
    authService.getUserById(req.auth.tenantId, req.auth.userId),
    authService.getTenantById(req.auth.tenantId),
  ]);
  if (!user || !tenant) return res.redirect('/login');
  req.cmmsUser = buildCmmsUser(req.auth, user.profile);
  req.tenant = tenant;
  req.tenantUser = user;
  req.tenantCmms = publicCmmsEntitlement(cmms);
  res.locals.user = user;
  res.locals.tenant = tenant;
  res.locals.cmmsEnabled = true;
  res.locals.cmmsUser = req.cmmsUser;
  res.locals.tenantCmms = req.tenantCmms;
  return next();
});

function mountCmmsWeb(router) {
  router.use(attachAuth, requireWebAuth, cmmsContext);

  router.use((req, res, next) => {
    res.locals.activePath = req.path.replace(/^\/cmms/, '') || '/dashboard';
    next();
  });

  return { requireCmmsWeb };
}

module.exports = { mountCmmsWeb, requireCmmsWeb, cmmsContext };

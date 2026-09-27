'use strict';

const authService = require('../services/authService');
const locationService = require('../services/locationService');
const tenantService = require('../services/tenantService');
const { buildCmmsUser } = require('../cmms/cmmsRoles');

/**
 * Load tenant shell context for PeakLogic pages.
 * @param {import('express').Request} req
 */
async function loadShellContext(req) {
  if (!req.auth) return null;
  const [user, tenant, locations] = await Promise.all([
    authService.getUserById(req.auth.tenantId, req.auth.userId),
    authService.getTenantById(req.auth.tenantId),
    locationService.listLocations(req.auth.tenantId),
  ]);
  if (!user || !tenant) return null;
  const cmmsEntitlement = await tenantService.getTenantCmmsEntitlement(req.auth.tenantId);
  return {
    user,
    tenant,
    locations,
    cmmsEnabled: !!cmmsEntitlement?.enabled,
    cmmsUser: buildCmmsUser(req.auth, user.profile),
  };
}

function applyShellLocals(res, ctx, extra = {}) {
  res.locals.user = ctx.user;
  res.locals.tenant = ctx.tenant;
  res.locals.locations = ctx.locations;
  res.locals.cmmsEnabled = ctx.cmmsEnabled;
  res.locals.cmmsUser = ctx.cmmsUser;
  Object.assign(res.locals, extra);
}

module.exports = { loadShellContext, applyShellLocals };

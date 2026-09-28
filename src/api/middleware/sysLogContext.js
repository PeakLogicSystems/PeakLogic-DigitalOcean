'use strict';

const { runWithContext, userFromRequest } = require('../../logger/sysLogContext');
const { TENANT_ID, DEPLOYMENT_MODE } = require('../../config');

function sysLogRequestContext(req, res, next) {
  const user = userFromRequest(req);
  if (user) req.peaklogicUser = user;
  runWithContext({
    tenantId: TENANT_ID,
    deployment: DEPLOYMENT_MODE,
    user,
    request: {
      method: req.method,
      path: req.originalUrl || req.url || req.path,
      ip: req.ip || req.socket?.remoteAddress || null,
    },
  }, () => next());
}

module.exports = { sysLogRequestContext };

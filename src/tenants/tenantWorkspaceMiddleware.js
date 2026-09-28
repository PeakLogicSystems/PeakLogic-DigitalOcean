'use strict';

const { isCloudDeployment } = require('../cloud/agentProtocol');
const { requireAuth } = require('./authMiddleware');
const { requireProjectTenant, getProjectTenantId } = require('../project/projectTenantContext');
const tenantRuntime = require('./tenantRuntime');

function createTenantWorkspaceMiddleware() {
  return (req, res, next) => {
    if (!isCloudDeployment()) return next();
    requireAuth(req, res, () => requireProjectTenant(req, res, async () => {
      try {
        await tenantRuntime.ensureLoaded(getProjectTenantId());
        next();
      } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to load workspace' });
      }
    }));
  };
}

module.exports = { createTenantWorkspaceMiddleware };

'use strict';

const { DEPLOYMENT_MODE } = require('../config');

function listAssignees() {
  if (DEPLOYMENT_MODE === 'appliance') {
    try {
      const applianceAuthStore = require('../auth/applianceAuthStore');
      return applianceAuthStore.listUsers()
        .filter((u) => u.active !== false)
        .map((u) => ({
          id: u.userId,
          email: u.email,
          name: u.name || u.email,
          role: u.role,
        }));
    } catch {
      return [];
    }
  }
  try {
    const { tenantStore } = require('../tenants/tenantStore');
    return tenantStore.listUsers()
      .filter((u) => u.active !== false)
      .map((u) => ({
        id: u.userId,
        email: u.email,
        name: u.name || u.email,
        role: u.role,
      }));
  } catch {
    return [];
  }
}

module.exports = { listAssignees };

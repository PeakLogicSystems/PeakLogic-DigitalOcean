'use strict';

/** Map peaklogic-cloud tenant roles to CMMS role hierarchy. */
const ROLE_LEVEL = {
  viewer: 1,
  operator: 2,
  technician: 2,
  supervisor: 3,
  manager: 4,
  admin: 5,
};

function cloudRoleToCmms(role) {
  if (role === 'admin') return 'admin';
  if (role === 'operator') return 'technician';
  return 'viewer';
}

function roleLevel(role) {
  return ROLE_LEVEL[role] || 0;
}

function canAccess(minRole, userRole) {
  const cmmsRole = cloudRoleToCmms(userRole);
  return roleLevel(cmmsRole) >= roleLevel(minRole);
}

function buildCmmsUser(auth, profile) {
  const email = auth.email;
  return {
    id: auth.userId,
    email,
    username: profile?.displayName || email.split('@')[0],
    role: cloudRoleToCmms(auth.role),
    cloudRole: auth.role,
    tenantId: auth.tenantId,
  };
}

module.exports = {
  cloudRoleToCmms,
  canAccess,
  buildCmmsUser,
  ROLE_LEVEL,
};

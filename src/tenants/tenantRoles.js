'use strict';

/** Tenant-scoped Cloud Studio roles (excluding platform_admin and partner roles). */
const TENANT_ROLES = Object.freeze([
  'operator',
  'technician',
  'supervisor',
  'tenant_admin',
]);

const PARTNER_ROLES = Object.freeze([
  'partner_admin',
  'partner_technician',
]);

const ALL_CLOUD_ROLES = Object.freeze([...TENANT_ROLES, ...PARTNER_ROLES]);

const TENANT_ROLE_LABELS = Object.freeze({
  operator: 'Operator',
  technician: 'Technician',
  supervisor: 'Supervisor',
  tenant_admin: 'Tenant admin',
  partner_admin: 'Partner admin',
  partner_technician: 'Partner technician',
});

function isTenantRole(role) {
  return TENANT_ROLES.includes(String(role || '').trim());
}

function isPartnerRole(role) {
  return PARTNER_ROLES.includes(String(role || '').trim());
}

function isCloudRole(role) {
  const r = String(role || '').trim();
  return r === 'platform_admin' || isTenantRole(r) || isPartnerRole(r);
}

function isTenantUserAdmin(role) {
  return role === 'tenant_admin' || role === 'platform_admin' || role === 'partner_admin';
}

function normalizeTenantRole(role, fallback = 'operator') {
  const r = String(role || fallback).trim();
  return isTenantRole(r) ? r : fallback;
}

module.exports = {
  TENANT_ROLES,
  PARTNER_ROLES,
  ALL_CLOUD_ROLES,
  TENANT_ROLE_LABELS,
  isTenantRole,
  isPartnerRole,
  isCloudRole,
  isTenantUserAdmin,
  normalizeTenantRole,
};

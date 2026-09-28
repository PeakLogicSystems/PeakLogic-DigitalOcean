'use strict';

const { TENANT_ROLES, TENANT_ROLE_LABELS, PARTNER_ROLES } = require('./tenantRoles');

/** Cloud Studio areas — what tenant users can see and do. */
const CLOUD_CAPABILITY_CATALOG = Object.freeze([
  { key: 'hmiView', label: 'HMI view (read-only screens)' },
  { key: 'hmiHand', label: 'HMI hand control (HOA Hand, run in hand)' },
  { key: 'studioEdit', label: 'Program, tags, drivers (edit)' },
  { key: 'runtime', label: 'Runtime start/stop' },
  { key: 'sites', label: 'Sites & cameras' },
  { key: 'devices', label: 'Device inventory' },
  { key: 'fleet', label: 'Assets map' },
  { key: 'alarms', label: 'Alarms (view & ack)' },
  { key: 'historian', label: 'Historian & trends' },
  { key: 'reports', label: 'Reports & export' },
  { key: 'cmms', label: 'CMMS' },
  { key: 'project', label: 'Projects (open/save/deploy)' },
  { key: 'people', label: 'People / user admin' },
]);

const CAPABILITY_KEYS = CLOUD_CAPABILITY_CATALOG.map((c) => c.key);

const OPERATOR_DEFAULTS = Object.freeze({
  hmiView: true,
  hmiHand: true,
  studioEdit: false,
  runtime: false,
  sites: true,
  devices: false,
  fleet: true,
  alarms: true,
  historian: true,
  reports: true,
  cmms: true,
  project: false,
  people: false,
});

const TECHNICIAN_DEFAULTS = Object.freeze({
  ...OPERATOR_DEFAULTS,
  studioEdit: true,
  runtime: true,
  sites: true,
  devices: true,
  fleet: true,
  project: true,
});

const SUPERVISOR_DEFAULTS = Object.freeze({
  ...TECHNICIAN_DEFAULTS,
  people: true,
});

const PARTNER_TECHNICIAN_DEFAULTS = Object.freeze({
  ...TECHNICIAN_DEFAULTS,
  people: false,
});

const PARTNER_ADMIN_DEFAULTS = Object.freeze({
  ...SUPERVISOR_DEFAULTS,
  people: true,
});

function allCapabilitiesTrue() {
  const out = {};
  for (const k of CAPABILITY_KEYS) out[k] = true;
  return out;
}

const CLOUD_ROLE_DEFAULTS = Object.freeze({
  operator: OPERATOR_DEFAULTS,
  technician: TECHNICIAN_DEFAULTS,
  supervisor: SUPERVISOR_DEFAULTS,
  tenant_admin: allCapabilitiesTrue(),
  partner_technician: PARTNER_TECHNICIAN_DEFAULTS,
  partner_admin: PARTNER_ADMIN_DEFAULTS,
});

function defaultFeaturesForCloudRole(role) {
  if (role === 'platform_admin') return allCapabilitiesTrue();
  const base = CLOUD_ROLE_DEFAULTS[role];
  return base ? { ...base } : { ...OPERATOR_DEFAULTS };
}

function normalizeCloudFeatures(input, role) {
  const base = defaultFeaturesForCloudRole(role);
  if (!input || typeof input !== 'object') return base;
  const raw = { ...input };
  if (raw.studioView != null && raw.hmiView == null) raw.hmiView = raw.studioView;
  const out = { ...base };
  for (const k of CAPABILITY_KEYS) {
    if (raw[k] != null) out[k] = !!raw[k];
  }
  if (role === 'tenant_admin' || role === 'platform_admin' || role === 'partner_admin') {
    for (const k of CAPABILITY_KEYS) out[k] = true;
  }
  return out;
}

function effectiveFeaturesForUser(user) {
  if (!user) return defaultFeaturesForCloudRole('operator');
  return normalizeCloudFeatures(user.features, user.role);
}

function cloudUserHasFeature(user, featureKey) {
  if (!user) return false;
  if (user.role === 'platform_admin' || user.role === 'tenant_admin' || user.role === 'partner_admin') return true;
  const feats = effectiveFeaturesForUser(user);
  return !!feats[featureKey];
}

function cloudAccessCatalogPayload() {
  const partnerRoles = PARTNER_ROLES.map((key) => ({
    key,
    label: TENANT_ROLE_LABELS[key] || key,
  }));
  return {
    catalog: CLOUD_CAPABILITY_CATALOG,
    roleDefaults: CLOUD_ROLE_DEFAULTS,
    roles: [
      ...TENANT_ROLES.map((key) => ({ key, label: TENANT_ROLE_LABELS[key] || key })),
      ...partnerRoles,
    ],
  };
}

module.exports = {
  CLOUD_CAPABILITY_CATALOG,
  CAPABILITY_KEYS,
  CLOUD_ROLE_DEFAULTS,
  defaultFeaturesForCloudRole,
  normalizeCloudFeatures,
  effectiveFeaturesForUser,
  cloudUserHasFeature,
  cloudAccessCatalogPayload,
};

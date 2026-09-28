'use strict';

/** Feature keys exposed in Setup user-access matrix (single-tenant appliance). */
const FEATURE_CATALOG = [
  { key: 'hmi', label: 'HMI / dashboard' },
  { key: 'hmiControl', label: 'HMI controls (setpoints, pump, dosing)' },
  { key: 'program', label: 'Program (ST)' },
  { key: 'tags', label: 'Tags' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'runtime', label: 'Runtime start/stop' },
  { key: 'alarms', label: 'Alarms (view & ack)' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'historian', label: 'Historian & logging' },
  { key: 'reports', label: 'Reports' },
  { key: 'cmms', label: 'CMMS (work orders & PM)' },
  { key: 'project', label: 'Projects (open/save/deploy)' },
  { key: 'setup', label: 'System setup' },
  { key: 'users', label: 'User accounts & access' },
  { key: 'facilityDraw', label: 'Facility Draw' },
  { key: 'connectivity', label: 'Connectivity tools' },
];

const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);

const OPERATOR_DEFAULT_FEATURES = {
  hmi: true,
  hmiControl: true,
  program: false,
  tags: false,
  drivers: false,
  runtime: false,
  alarms: true,
  cameras: true,
  historian: true,
  reports: true,
  cmms: true,
  project: false,
  setup: false,
  users: false,
  facilityDraw: false,
  connectivity: false,
};

const VIEWER_DEFAULT_FEATURES = {
  hmi: true,
  hmiControl: false,
  program: false,
  tags: false,
  drivers: false,
  runtime: false,
  alarms: true,
  cameras: true,
  historian: false,
  reports: true,
  cmms: false,
  project: false,
  setup: false,
  users: false,
  facilityDraw: false,
  connectivity: false,
};

/** Residential pool customer — water quality + status on mobile/cloud (read-only HMI). */
const HOMEOWNER_DEFAULT_FEATURES = {
  hmi: true,
  hmiControl: false,
  program: false,
  tags: false,
  drivers: false,
  runtime: false,
  alarms: true,
  cameras: false,
  historian: false,
  reports: false,
  cmms: false,
  project: false,
  setup: false,
  users: false,
  facilityDraw: false,
  connectivity: false,
};

/** Field technician — commission drivers/tags, runtime, setup; no user admin. */
const TECHNICIAN_DEFAULT_FEATURES = {
  hmi: true,
  hmiControl: true,
  program: true,
  tags: true,
  drivers: true,
  runtime: true,
  alarms: true,
  cameras: true,
  historian: true,
  reports: true,
  cmms: true,
  project: true,
  setup: true,
  users: false,
  facilityDraw: false,
  connectivity: true,
};

const CLOUD_ADMIN_ROLES = new Set(['platform_admin', 'tenant_admin', 'admin']);

/** Roles shown in cloud access matrix (below tenant_admin). */
const CLOUD_MATRIX_ROLES = ['operator', 'technician', 'viewer', 'homeowner'];

const ROLE_FEATURE_DEFAULTS = {
  operator: OPERATOR_DEFAULT_FEATURES,
  technician: TECHNICIAN_DEFAULT_FEATURES,
  viewer: VIEWER_DEFAULT_FEATURES,
  homeowner: HOMEOWNER_DEFAULT_FEATURES,
};

function isCloudMatrixEditableRole(role) {
  return CLOUD_MATRIX_ROLES.includes(role);
}

function allFeaturesTrue() {
  const out = {};
  for (const k of FEATURE_KEYS) out[k] = true;
  return out;
}

function defaultFeaturesForRole(role) {
  if (role === 'admin' || CLOUD_ADMIN_ROLES.has(role)) return allFeaturesTrue();
  if (role === 'technician') return { ...TECHNICIAN_DEFAULT_FEATURES };
  if (role === 'homeowner') return { ...HOMEOWNER_DEFAULT_FEATURES };
  if (role === 'viewer') return { ...VIEWER_DEFAULT_FEATURES };
  return { ...OPERATOR_DEFAULT_FEATURES };
}

function normalizeFeatures(input, role) {
  const base = defaultFeaturesForRole(role);
  if (!input || typeof input !== 'object') return base;
  const out = { ...base };
  for (const k of FEATURE_KEYS) {
    if (input[k] != null) out[k] = !!input[k];
  }
  if (role === 'admin' || CLOUD_ADMIN_ROLES.has(role)) {
    for (const k of FEATURE_KEYS) out[k] = true;
  }
  return out;
}

function userHasFeature(user, featureKey) {
  if (!user) return false;
  if (user.role === 'admin' || CLOUD_ADMIN_ROLES.has(user.role)) return true;
  return !!user.features?.[featureKey];
}

module.exports = {
  FEATURE_CATALOG,
  FEATURE_KEYS,
  CLOUD_ADMIN_ROLES,
  CLOUD_MATRIX_ROLES,
  ROLE_FEATURE_DEFAULTS,
  OPERATOR_DEFAULT_FEATURES,
  HOMEOWNER_DEFAULT_FEATURES,
  TECHNICIAN_DEFAULT_FEATURES,
  VIEWER_DEFAULT_FEATURES,
  isCloudMatrixEditableRole,
  allFeaturesTrue,
  defaultFeaturesForRole,
  normalizeFeatures,
  userHasFeature,
};

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.PEAKLOGIC_DATA || path.join(ROOT, 'data');

function resolveStDir() {
  const raw = process.env.PEAKLOGIC_ST || path.join(ROOT, 'st');
  let dir = path.resolve(raw);
  try {
    if (fs.existsSync(dir)) {
      dir = fs.realpathSync.native(dir);
    }
  } catch {
    /* keep resolved path */
  }
  return dir;
}

const ST_DIR = resolveStDir();
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_PROGRAM = 'program.st';

function resolveDeploymentMode() {
  if (String(process.env.PEAKLOGIC_DEPLOYMENT || '').trim().toLowerCase() === 'cloud') {
    return 'cloud';
  }
  try {
    const { isCloudDeployment } = require('./cloud/agentProtocol');
    if (isCloudDeployment()) return 'cloud';
  } catch { /* ignore */ }
  return 'appliance';
}

const DEPLOYMENT_MODE = resolveDeploymentMode();
const TENANT_ID = process.env.PEAKLOGIC_TENANT_ID
  || (DEPLOYMENT_MODE === 'cloud' ? '' : 'local');

const TELEMETRY_INGEST_MODE = String(process.env.TELEMETRY_INGEST_MODE || 'local').trim().toLowerCase();

const CONFIG_URI = process.env.PEAKLOGIC_CONFIG_URI
  || process.env.MONGODB_URI
  || process.env.MONGO_URL
  || '';
const CONFIG_DB = process.env.PEAKLOGIC_CONFIG_DB || 'peaklogic';
const CONFIG_COLLECTION = process.env.PEAKLOGIC_CONFIG_COLLECTION || 'configDocuments';
const CONFIG_PROJECTS_COLLECTION = process.env.PEAKLOGIC_CONFIG_PROJECTS_COLLECTION || 'configProjects';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || '';
const MONGODB_DB = process.env.MONGODB_DB || 'peaklogic';
const DOCUMENTDB_ENABLED = String(process.env.DOCUMENTDB_ENABLED || '').trim().toLowerCase() === 'true';

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || '';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (DEPLOYMENT_MODE === 'cloud') {
    console.warn('[config] JWT_SECRET is not set — using a random dev secret; sessions will not survive a restart. Set JWT_SECRET in production.');
  }
  return require('crypto').randomBytes(32).toString('hex');
})();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

const PLATFORM_ADMIN_KEY = process.env.PLATFORM_ADMIN_KEY || '';
function isPlatformAdminConfigured() {
  return Boolean(PLATFORM_ADMIN_KEY);
}
function platformAdminKeyMatches(key) {
  if (!PLATFORM_ADMIN_KEY || !key) return false;
  const a = Buffer.from(String(key));
  const b = Buffer.from(PLATFORM_ADMIN_KEY);
  if (a.length !== b.length) return false;
  return require('crypto').timingSafeEqual(a, b);
}

const REQUEST_JSON_LIMIT = process.env.REQUEST_JSON_LIMIT || '5mb';

const EDITION = {
  product: 'peaklogic',
  label: 'PeakLogic',
  platform: DEPLOYMENT_MODE === 'cloud' ? 'cloud' : 'appliance',
  tagline: 'Industrial SCADA studio — HMI, drivers, historian, and MQTT Parc edge runtime.',
};

const LIMITS = {
  locationsPerTenant: Number(process.env.LIMIT_LOCATIONS_PER_TENANT) || 100,
  systemsPerLocation: Number(process.env.LIMIT_SYSTEMS_PER_LOCATION) || 50,
  devicesPerSystem: Number(process.env.LIMIT_DEVICES_PER_SYSTEM) || 200,
};

module.exports = {
  ROOT,
  DATA_DIR,
  ST_DIR,
  PUBLIC_DIR,
  DEFAULT_PROGRAM,
  MAX_TAGS: 10000,
  DEFAULT_PORT: Number(process.env.PORT) || 3090,
  DEFAULT_SCAN_MS: 100,
  DEFAULT_MQTT_PARC_BROKER: process.env.PEAKLOGIC_MQTT_BROKER || 'mqtt://127.0.0.1:1883',
  DASHBOARD_POLL_MS: 800,
  LIVE_WS_INTERVAL_MS: 250,
  AUTH_TOKEN: process.env.PEAKLOGIC_TOKEN || '',
  DEPLOYMENT_MODE,
  TENANT_ID,
  TELEMETRY_INGEST_MODE,
  CONFIG_URI,
  CONFIG_DB,
  CONFIG_COLLECTION,
  CONFIG_PROJECTS_COLLECTION,
  SERVICE_BUS_CONNECTION_STRING: process.env.SERVICE_BUS_CONNECTION_STRING || '',
  SERVICE_BUS_NAMESPACE: process.env.SERVICE_BUS_NAMESPACE || '',
  EVENT_HUB_CONNECTION_STRING: process.env.EVENT_HUB_CONNECTION_STRING || '',
  EVENT_HUB_NAME: process.env.EVENT_HUB_NAME || '',
  MONGODB_URI,
  MONGODB_DB,
  DOCUMENTDB_ENABLED,
  PUBLIC_APP_URL,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  PLATFORM_ADMIN_KEY,
  isPlatformAdminConfigured,
  platformAdminKeyMatches,
  REQUEST_JSON_LIMIT,
  EDITION,
  LIMITS,
};

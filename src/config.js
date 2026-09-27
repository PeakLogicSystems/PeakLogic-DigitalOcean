'use strict';

const crypto = require('crypto');
const path = require('path');
const { loadEnv } = require('./loadEnv');
const { getEdition } = require('./product/edition');

loadEnv();

/** Trim env secrets; strip one layer of quotes (common in copy-pasted .env values). */
function readEnvSecret(name, fallback = '') {
  let value = String(process.env[name] ?? fallback).trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

/** True when an env value still looks like an unfilled install template placeholder. */
function isEnvPlaceholder(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  return /^(REPLACE_WITH_|CHANGE_ME|YOUR_|TODO|XXXX)/i.test(v);
}

function resolvePlatformAdminKey() {
  const raw = readEnvSecret('PLATFORM_ADMIN_KEY');
  return isEnvPlaceholder(raw) ? '' : raw;
}

function isPlatformAdminConfigured() {
  return Boolean(PLATFORM_ADMIN_KEY);
}

/** Constant-time comparison so a wrong guess can't be timed against the real key. */
function platformAdminKeyMatches(input) {
  if (!PLATFORM_ADMIN_KEY) return false;
  const provided = Buffer.from(String(input || '').trim());
  const expected = Buffer.from(PLATFORM_ADMIN_KEY);
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

const ROOT = path.resolve(__dirname, '..');

const DATA_DIR = process.env.PEAKLOGIC_DATA || path.join(ROOT, 'data');
const ST_DIR = process.env.PEAKLOGIC_ST || path.join(ROOT, 'st');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_PROGRAM = 'logic/program.st';

const PORT = Number(process.env.PORT) || 3100;
const DEFAULT_PORT = Number(process.env.PEAKLOGIC_RUNTIME_PORT) || 3090;

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || '';
const MONGODB_DB = process.env.MONGODB_DB || 'peaklogic_cloud';

const JWT_SECRET = readEnvSecret('JWT_SECRET', 'dev-only-change-in-production');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const PLATFORM_ADMIN_KEY = resolvePlatformAdminKey();
const AUTH_TOKEN = readEnvSecret('PEAKLOGIC_TOKEN');

const PUBLIC_API_URL = process.env.PUBLIC_API_URL || '';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || PUBLIC_APP_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LIMITS = {
  locationsPerTenant: Number(process.env.MAX_LOCATIONS_PER_TENANT) || 1000,
  systemsPerLocation: Number(process.env.MAX_SYSTEMS_PER_LOCATION) || 1000,
  devicesPerSystem: Number(process.env.MAX_DEVICES_PER_SYSTEM) || 1000,
};

const MAX_TAGS = Math.max(64, Number(process.env.PEAKLOGIC_MAX_TAGS) || 4096);
const DEFAULT_SCAN_MS = Number(process.env.PEAKLOGIC_SCAN_MS) || 100;
const DEFAULT_MQTT_PARC_BROKER = process.env.PEAKLOGIC_MQTT_BROKER || 'mqtt://127.0.0.1:1883';
const DASHBOARD_POLL_MS = Number(process.env.PEAKLOGIC_DASHBOARD_POLL_MS) || 800;
const LIVE_WS_INTERVAL_MS = Number(process.env.LIVE_WS_INTERVAL_MS) || 250;

/**
 * 'cloud' (multi-tenant API, src/server.js) vs 'appliance' (local runtime, root
 * server.js). Defaults to 'cloud' since that's this repo's primary entrypoint;
 * root server.js sets PEAKLOGIC_DEPLOYMENT=appliance before requiring config.
 */
const DEPLOYMENT_MODE = process.env.PEAKLOGIC_DEPLOYMENT === 'appliance' ? 'appliance' : 'cloud';

/** Single-tenant identity for the local/appliance runtime (has no real tenant table). */
const TENANT_ID = process.env.PEAKLOGIC_TENANT_ID || 'local';

/** Mongo-backed settings store shared by the local runtime (src/configStore/). */
const CONFIG_URI = process.env.PEAKLOGIC_CONFIG_URI || MONGODB_URI || 'mongodb://127.0.0.1:27017';
const CONFIG_DB = process.env.PEAKLOGIC_CONFIG_DB || 'peaklogic_config';
const CONFIG_COLLECTION = process.env.PEAKLOGIC_CONFIG_COLLECTION || 'config_documents';
const CONFIG_PROJECTS_COLLECTION = process.env.PEAKLOGIC_CONFIG_PROJECTS_COLLECTION || 'project_snapshots';

const REQUEST_JSON_LIMIT = process.env.PEAKLOGIC_JSON_LIMIT || '32mb';

/**
 * Optional Azure messaging backends for telemetry ingest — not part of this
 * product's DigitalOcean/MongoDB deployment target. Left as plain env
 * passthroughs (no placeholder detection, no SDK calls here) so the
 * src/messaging/* modules that reference them stay inert unless someone
 * deliberately configures Azure Service Bus / Event Hub.
 */
const SERVICE_BUS_CONNECTION_STRING = process.env.SERVICE_BUS_CONNECTION_STRING || '';
const SERVICE_BUS_NAMESPACE = process.env.SERVICE_BUS_NAMESPACE || '';
const EVENT_HUB_CONNECTION_STRING = process.env.EVENT_HUB_CONNECTION_STRING || '';
const EVENT_HUB_NAME = process.env.EVENT_HUB_NAME || 'telemetry';

/** eventhub | servicebus | direct — direct (straight to Mongo) is this product's real path. */
const TELEMETRY_INGEST_MODE = process.env.TELEMETRY_INGEST_MODE || 'direct';
const TELEMETRY_TTL_DAYS = Number(process.env.TELEMETRY_TTL_DAYS) || 7;

/** Always false for a plain MongoDB deployment; only relevant to an Azure Cosmos DB / AWS DocumentDB target. */
const DOCUMENTDB_ENABLED = process.env.DOCUMENTDB_ENABLED === 'true';

const EDITION = getEdition();
const PEAKLOGIC_PLATFORM = process.env.PEAKLOGIC_PLATFORM || EDITION.platform;

module.exports = {
  ROOT,
  DATA_DIR,
  ST_DIR,
  PUBLIC_DIR,
  DEFAULT_PROGRAM,
  MAX_TAGS,
  DEFAULT_PORT,
  DEFAULT_SCAN_MS,
  DEFAULT_MQTT_PARC_BROKER,
  DASHBOARD_POLL_MS,
  LIVE_WS_INTERVAL_MS,
  AUTH_TOKEN,
  DEPLOYMENT_MODE,
  TENANT_ID,
  CONFIG_URI,
  CONFIG_DB,
  CONFIG_COLLECTION,
  CONFIG_PROJECTS_COLLECTION,
  REQUEST_JSON_LIMIT,
  PORT,
  MONGODB_URI,
  MONGODB_DB,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  PLATFORM_ADMIN_KEY,
  isPlatformAdminConfigured,
  platformAdminKeyMatches,
  PUBLIC_API_URL,
  PUBLIC_APP_URL,
  CORS_ORIGINS,
  LIMITS,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SERVICE_BUS_CONNECTION_STRING,
  SERVICE_BUS_NAMESPACE,
  EVENT_HUB_CONNECTION_STRING,
  EVENT_HUB_NAME,
  TELEMETRY_INGEST_MODE,
  TELEMETRY_TTL_DAYS,
  DOCUMENTDB_ENABLED,
  PEAKLOGIC_PLATFORM,
  EDITION,
};

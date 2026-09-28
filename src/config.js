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
};

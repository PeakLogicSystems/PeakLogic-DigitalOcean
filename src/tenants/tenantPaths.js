'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR, ST_DIR, DEPLOYMENT_MODE } = require('../config');
const { isCloudDeployment } = require('../cloud/agentProtocol');

const GLOBAL_DATA_FILES = new Set([
  'cloud_tenants.json',
  'cloud_sites.json',
  'cmms.json',
  'cameras.json',
  'peaklogic.pid',
  'sys_log.json',
  'parc.json',
]);

function getProjectTenantIdLazy() {
  try {
    return require('../project/projectTenantContext').getProjectTenantId();
  } catch {
    return null;
  }
}

function globalProjectsDir() {
  return path.join(DATA_DIR, 'projects');
}

function boilerplateProjectsDir() {
  const preferred = path.join(DATA_DIR, 'boilerplate', 'projects');
  if (fs.existsSync(preferred)) return preferred;
  return globalProjectsDir();
}

function tenantRootDir(tenantId) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required');
  return path.join(DATA_DIR, 'tenants', tid);
}

function tenantProjectsDir(tenantId) {
  return path.join(tenantRootDir(tenantId), 'projects');
}

function ensureTenantProjectsDir(tenantId) {
  const dir = tenantProjectsDir(tenantId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function activeTenantIdOrNull() {
  return getProjectTenantIdLazy();
}

function resolveTenantDataRoot() {
  const tid = activeTenantIdOrNull();
  if (tid && isCloudDeployment()) return tenantRootDir(tid);
  return DATA_DIR;
}

function resolveTenantRelativePath(name) {
  const tid = activeTenantIdOrNull();
  if (tid && isCloudDeployment() && !GLOBAL_DATA_FILES.has(name)) {
    return path.join(tenantRootDir(tid), name);
  }
  return path.join(DATA_DIR, name);
}

function resolveStDir() {
  const tid = activeTenantIdOrNull();
  if (tid && isCloudDeployment()) {
    const dir = path.join(tenantRootDir(tid), 'st');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  return ST_DIR;
}

function resolveMvDrawDir() {
  return path.join(resolveTenantDataRoot(), 'mv-draw');
}

function resolveHmiImportsDir() {
  const dir = path.join(resolveTenantDataRoot(), 'hmi-imports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureTenantWorkspaceDirs(tenantId) {
  const root = tenantRootDir(tenantId);
  for (const sub of ['st', 'mv-draw', 'mv-draw/projects', 'mv-draw/uploads', 'hmi-imports']) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  return root;
}

module.exports = {
  globalProjectsDir,
  boilerplateProjectsDir,
  tenantRootDir,
  tenantProjectsDir,
  ensureTenantProjectsDir,
  ensureTenantWorkspaceDirs,
  resolveTenantDataRoot,
  resolveTenantRelativePath,
  resolveStDir,
  resolveMvDrawDir,
  resolveHmiImportsDir,
  GLOBAL_DATA_FILES,
  isCloudMultiTenant: () => DEPLOYMENT_MODE === 'cloud',
};

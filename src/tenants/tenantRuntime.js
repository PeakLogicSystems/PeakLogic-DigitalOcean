'use strict';

const { TagStore } = require('../tags/tagStore');
const { DriverManager } = require('../drivers');
const { GraphHistory } = require('../runtime/graphHistory');
const { ScanEngine } = require('../runtime/scanEngine');
const { DeviceRegistry } = require('../parc/deviceRegistry');
const configStore = require('../configStore');
const { applyStartupOnBoot } = require('../project/startupLoader');
const { runWithProjectTenant } = require('../project/projectTenantContext');
const { ensureTenantWorkspaceDirs } = require('./tenantPaths');
const { isCloudDeployment } = require('../cloud/agentProtocol');
const { seedTenantStPrograms } = require('./seedTenantStPrograms');

/** @type {Map<string, object>} */
const runtimes = new Map();

/** @type {object|null} */
let applianceRuntime = null;

function createRuntimeBundle(tenantId) {
  const tagStore = new TagStore();
  const driverManager = new DriverManager(tagStore);
  const graphHistory = new GraphHistory();
  const scanEngine = new ScanEngine(tagStore, driverManager, graphHistory);
  const registry = new DeviceRegistry();
  return {
    tenantId,
    tagStore,
    driverManager,
    graphHistory,
    scanEngine,
    registry,
  };
}

function setApplianceRuntime(bundle) {
  applianceRuntime = bundle;
}

function getApplianceRuntime() {
  return applianceRuntime;
}

function getRuntime(tenantId) {
  if (!tenantId) return applianceRuntime;
  return runtimes.get(tenantId) || null;
}

function getActiveRuntime() {
  const { getProjectTenantId } = require('../project/projectTenantContext');
  const tid = getProjectTenantId();
  if (tid && isCloudDeployment()) {
    return runtimes.get(tid) || null;
  }
  return applianceRuntime;
}

function getActiveRegistry() {
  return getActiveRuntime()?.registry || null;
}

async function ensureLoaded(tenantId) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required');
  if (runtimes.has(tid)) return runtimes.get(tid);

  ensureTenantWorkspaceDirs(tid);
  if (isCloudDeployment()) {
    try {
      seedTenantStPrograms(tid);
    } catch (e) {
      console.warn(`[tenant-runtime] ST seed for ${tid}:`, e.message || e);
    }
  }
  await configStore.ensureTenantLoaded(tid, { seedIfEmpty: true });

  const bundle = await runWithProjectTenant(tid, async () => {
    const rt = createRuntimeBundle(tid);
    try {
      await applyStartupOnBoot(rt);
    } catch (e) {
      console.warn(`[tenant-runtime] startup for ${tid}:`, e.message || e);
    }
    rt.scanEngine.loadSettings();
    return rt;
  });

  runtimes.set(tid, bundle);
  return bundle;
}

function invalidate(tenantId) {
  const tid = String(tenantId || '').trim();
  if (!tid) return false;
  const rt = runtimes.get(tid);
  if (rt?.scanEngine?.running) {
    try { rt.scanEngine.stop(); } catch { /* ignore */ }
  }
  return runtimes.delete(tid);
}

module.exports = {
  createRuntimeBundle,
  setApplianceRuntime,
  getApplianceRuntime,
  getRuntime,
  getActiveRuntime,
  getActiveRegistry,
  ensureLoaded,
  invalidate,
};

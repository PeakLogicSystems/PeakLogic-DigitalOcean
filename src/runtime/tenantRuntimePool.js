'use strict';

const fs = require('fs');
const path = require('path');
const { TagStore } = require('../tags/tagStore');
const { DriverManager } = require('../drivers');
const { ScanEngine } = require('./scanEngine');
const { GraphHistory } = require('./graphHistory');
const persistence = require('../persistence');
const programStore = require('../programs/programStore');
const { registry } = require('../parc/deviceRegistry');
const { getMqttCentralHub } = require('../parc/mqttCentralHub');
const { bootstrapMqttParc, hubBootSkipReason } = require('../parc/mqttParcBootstrap');
const { reconcileMqttParcDriversFromRegistry } = require('../devices/bulkAddParcOpta');
const { runWithRequestContext, tenantPaths } = require('./requestContext');
const { ensureUserImportsDir } = require('../hmi/hmiUserAssets');

/** @type {Map<string, { deps: object, paths: object, booted: boolean }>} */
const tenants = new Map();

function createRuntimeDeps() {
  const tagStore = new TagStore();
  const driverManager = new DriverManager(tagStore);
  const graphHistory = new GraphHistory();
  const scanEngine = new ScanEngine(tagStore, driverManager, graphHistory);
  return { tagStore, driverManager, graphHistory, scanEngine };
}

async function seedTenantBundledProjectsIfEmpty(tenantId) {
  const configStore = require('../configStore');
  if (!configStore.status().ready) return;
  const projects = await configStore.refreshProjectIndex();
  if (projects.length > 0) return;
  const { syncBundledProjectsFromDisk } = require('../configStore/migrateFromFiles');
  const mongoBackend = require('../configStore/mongoBackend');
  const { safeId } = require('../project/projectIds');
  const synced = await syncBundledProjectsFromDisk({
    writeProjectSnapshot: mongoBackend.writeProjectSnapshot,
    safeId,
    existingIds: new Set(),
  });
  if (synced.length) {
    console.log(`[studio:${tenantId}] seeded bundled project(s): ${synced.join(', ')}`);
  }
}

async function bootTenant(tenantId) {
  const paths = tenantPaths(tenantId);
  fs.mkdirSync(paths.dataDir, { recursive: true });
  fs.mkdirSync(paths.stDir, { recursive: true });
  ensureUserImportsDir(paths.dataDir);

  const entry = { deps: createRuntimeDeps(), paths, booted: false };
  tenants.set(tenantId, entry);

  await runWithRequestContext(paths, async () => {
    persistence.ensureDataDir();
    await seedTenantBundledProjectsIfEmpty(tenantId);
    programStore.migrateLegacyProgram();
    entry.deps.scanEngine.loadSettings();
    try {
      await entry.deps.driverManager.rebuild({ connectDeferred: true });
    } catch (e) {
      console.warn(`[studio:${tenantId}] drivers rebuild:`, e.message || e);
    }
    const recon = reconcileMqttParcDriversFromRegistry(
      entry.deps.driverManager.list(),
      registry,
    );
    if (recon.changed) {
      entry.deps.driverManager.save(recon.drivers);
      try {
        await entry.deps.driverManager.rebuild({ connectDeferred: true });
      } catch (e) {
        console.warn(`[studio:${tenantId}] drivers after registry restore:`, e.message || e);
      }
    }
    const settings = persistence.readJson('settings.json', {});
    const bootMqtt = await bootstrapMqttParc({ settings, drivers: entry.deps.driverManager.list() });
    if (bootMqtt.changed) entry.deps.scanEngine.loadSettings();
    if (bootMqtt.hub?.started) {
      try {
        await entry.deps.driverManager.linkMqttParcDriversIfHubLive();
      } catch (e) {
        console.warn(`[studio:${tenantId}] mqtt parc auto-link:`, e.message || e);
      }
    } else if (bootMqtt.hub?.skipped) {
      const why = hubBootSkipReason(bootMqtt.settings || settings, entry.deps.driverManager.list());
      if (why) console.log(`[studio:${tenantId}] mqtt-parc hub not started: ${why}`);
    }
    entry.booted = true;
  });

  return entry;
}

async function getTenantRuntime(tenantId) {
  if (!tenantId) throw new Error('tenantId required');
  let entry = tenants.get(tenantId);
  if (!entry) entry = await bootTenant(tenantId);
  return entry;
}

function runInTenantContext(tenantId, fn) {
  const entry = tenants.get(tenantId);
  const paths = entry?.paths || tenantPaths(tenantId);
  return runWithRequestContext(paths, fn);
}

module.exports = {
  getTenantRuntime,
  runInTenantContext,
  tenantPaths,
};

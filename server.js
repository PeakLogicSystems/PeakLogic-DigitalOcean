'use strict';

require('./src/loadEnv');
const { installConsoleTimestamp, setConsoleTimezone } = require('./src/logger/consoleTimestamp');
installConsoleTimestamp();

const path = require('path');
const fs = require('fs');
const express = require('express');
const {
  DEFAULT_PORT, DATA_DIR, ST_DIR, DEPLOYMENT_MODE, TENANT_ID, REQUEST_JSON_LIMIT,
} = require('./src/config');
const { ensureUserImportsDir } = require('./src/hmi/hmiUserAssets');
const persistence = require('./src/persistence');
const { readTimezoneFromSettings } = require('./src/settings/timezoneSettings');
setConsoleTimezone(readTimezoneFromSettings(persistence.readJson('settings.json', {})));
const { TagStore } = require('./src/tags/tagStore');
const { DriverManager } = require('./src/drivers');
const { ScanEngine, shouldAutoStartRuntime } = require('./src/runtime/scanEngine');
const { applyStartupOnBoot } = require('./src/project/startupLoader');
const { seedDefaultProjectIfEmpty } = require('./src/configStore/seedDefaultProject');
const { GraphHistory } = require('./src/runtime/graphHistory');
const { createExpressApi } = require('./src/api/expressRouter');
const { createPageRoutes } = require('./src/routes/pages');
const { createCloudStudioPages } = require('./src/routes/cloudStudioPages');
const adminWebRouter = require('./src/routes/adminWeb');
const adminApiRouter = require('./src/routes/admin');
const { attachSession } = require('./src/tenants/authMiddleware');
const { createHmiAssetRedirect } = require('./src/routes/staticAssets');
const programStore = require('./src/programs/programStore');
const mongoTagLogger = require('./src/logger/mongoTagLogger');
const hardwareHistoryStore = require('./src/hardware/hardwareHistoryStore');
const mongoSysLog = require('./src/logger/mongoSysLog');
const { registry } = require('./src/parc/deviceRegistry');
const { getMqttCentralHub } = require('./src/parc/mqttCentralHub');
const { bootstrapMqttParc, hubBootSkipReason } = require('./src/parc/mqttParcBootstrap');
const {
  stripParcNoiseDrivers,
  reconcileMqttParcDriversFromRegistry,
  pruneParcRegistryNoise,
} = require('./src/devices/bulkAddParcOpta');
const { patchWorkspaceDrivers } = require('./src/project/estFile');
const { startPdmBatchScheduler } = require('./src/pdm/pdmBatchScheduler');
const { setBatchScheduler } = require('./src/api/routes/pdmSchedulerHolder');
const { registerApplianceServices } = require('./src/runtime/applianceServices');
const configStore = require('./src/configStore');
const simManager = require('./src/cloud/simManager');
const { isCloudSimsEnabled } = require('./src/cloud/cloudSimsEnabled');
const mosquittoLogIngest = require('./src/mqtt/mosquittoLogIngest');
const tenantRuntime = require('./src/tenants/tenantRuntime');
const { createTenantRuntimeProxies } = require('./src/tenants/tenantRuntimeProxy');

const PRODUCT = process.env.PEAKLOGIC_PRODUCT || 'mvp-suite';
const IS_CLOUD = DEPLOYMENT_MODE === 'cloud';

registerApplianceServices();
mongoSysLog.installProcessHandlers();

let tagStore;
let driverManager;
let graphHistory;
let scanEngine;

function createRuntimeStores() {
  const bundle = tenantRuntime.createRuntimeBundle('appliance');
  tagStore = bundle.tagStore;
  driverManager = bundle.driverManager;
  graphHistory = bundle.graphHistory;
  scanEngine = bundle.scanEngine;
  tenantRuntime.setApplianceRuntime(bundle);
  getMqttCentralHub(registry).setAutoDiscoveryDeps({
    driverManager,
    tagStore,
    getSettings: () => persistence.readJson('settings.json', {}),
  });
  getMqttCentralHub(registry).setGlobalMirrorDeps({ tagStore });
}

if (IS_CLOUD) {
  const proxies = createTenantRuntimeProxies();
  tagStore = proxies.tagStore;
  driverManager = proxies.driverManager;
  graphHistory = proxies.graphHistory;
  scanEngine = proxies.scanEngine;
} else {
  createRuntimeStores();
}

const { version: APP_VERSION } = require('./package.json');
const publicRoot = path.join(__dirname, 'public');

const app = express();
app.use(express.json({ limit: REQUEST_JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_JSON_LIMIT }));
app.use(require('cookie-parser')());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(createHmiAssetRedirect(publicRoot));
ensureUserImportsDir(DATA_DIR);
app.use('/hmi/user', express.static(path.join(DATA_DIR, 'hmi-imports'), { fallthrough: false }));
app.use(express.static(publicRoot));
if (DEPLOYMENT_MODE === 'cloud') {
  app.use(attachSession);
  app.get('/login', (req, res) => {
    if (req.mvAuth) return res.redirect(String(req.query.next || '/'));
    return res.render('cloud-login');
  });
  app.get('/accept-invite', (req, res) => {
    if (req.mvAuth) return res.redirect('/');
    return res.render('accept-invite');
  });
  app.get('/forgot-password', (req, res) => {
    if (req.mvAuth) return res.redirect('/');
    return res.render('forgot-password');
  });
  app.get('/reset-password', (req, res) => {
    if (req.mvAuth) return res.redirect('/');
    return res.render('reset-password');
  });
}
app.use(createPageRoutes({ appVersion: APP_VERSION, product: PRODUCT, deployment: DEPLOYMENT_MODE }));
app.use('/api', createExpressApi({ tagStore, driverManager, scanEngine, graphHistory }));
app.use('/api/admin', adminApiRouter);
if (DEPLOYMENT_MODE === 'cloud') {
  // Mounted before createCloudStudioPages so /admin/* (platform Control Center)
  // is handled here rather than falling through to that router's blanket
  // requireAuth gate, which also defines a conflicting /admin/tenants route.
  app.use('/admin', adminWebRouter);
  app.use(createCloudStudioPages({ appVersion: APP_VERSION, product: PRODUCT }));
}

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: `Request body too large for ${req.method} ${req.path} (limit ${REQUEST_JSON_LIMIT}). Restart PeakLogic after updating, or reduce tags/HMI payload size.`,
      limit: REQUEST_JSON_LIMIT,
      path: req.path,
    });
  }
  return next(err);
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'PeakLogic',
    product: PRODUCT,
    deployment: DEPLOYMENT_MODE,
    tenantId: TENANT_ID,
    version: APP_VERSION,
    requestJsonLimit: REQUEST_JSON_LIMIT,
    runtime: IS_CLOUD ? { mode: 'cloud-multi-tenant' } : scanEngine.status(),
    dataDir: DATA_DIR,
    stDir: ST_DIR,
    config: configStore.status(),
  });
});

async function boot() {
  console.log('[boot] PeakLogic starting…');
  persistence.ensureDataDir();
  const configInit = await configStore.init();
  console.log('[configStore]', configInit.status?.db || 'mongo');

  let settings = { port: DEFAULT_PORT };
  if (!IS_CLOUD) {
    tagStore.load();
    driverManager.reloadFromPersistence();
    registry.reloadFromPersistence();
    programStore.migrateLegacyProgram();
    await seedDefaultProjectIfEmpty({ tagStore, driverManager });
    const startupResult = await applyStartupOnBoot({ tagStore, driverManager, scanEngine, graphHistory });
    if (startupResult.loaded) {
      console.log(`[startup] loaded ${startupResult.mode}${startupResult.name ? `: ${startupResult.name}` : ''}`);
      programStore.ensureActiveProgram();
    } else if (startupResult.reason || startupResult.error) {
      console.log(`[startup] ${startupResult.mode}: ${startupResult.reason || startupResult.error}`);
    }
    const strip = stripParcNoiseDrivers(driverManager.list());
    if (strip.changed) {
      driverManager.save(strip.drivers);
      patchWorkspaceDrivers(strip.drivers);
      console.log(`[mqtt-parc] removed test/debug drivers: ${strip.removed.join(', ')}`);
    }
    const regPrune = pruneParcRegistryNoise(registry);
    if (regPrune.removed.length) {
      console.log(`[mqtt-parc] pruned Parc registry noise: ${regPrune.removed.join(', ')}`);
    }
    settings = persistence.readJson('settings.json', settings);
    if (settings.graphMaxPoints) graphHistory.setMaxPoints(settings.graphMaxPoints);
    scanEngine.loadSettings();
  } else {
    console.log('[boot] cloud SaaS — Studio workspace loads per organization on first request');
    try {
      const { syncBoilerplateFromLibrary, seedAllTenantsBoilerplate } = require('./src/project/seedTenantBoilerplate');
      syncBoilerplateFromLibrary();
      const rows = seedAllTenantsBoilerplate();
      const copied = rows.reduce((n, r) => n + (r.copied || 0), 0);
      if (copied) console.log(`[boot] synced ${copied} new boilerplate project(s) to tenant libraries`);
    } catch (e) {
      console.warn('[boot] tenant boilerplate sync:', e.message || e);
    }
    try {
      registry.reloadFromPersistence();
      const { bootstrapCloudParcMqttHub } = require('./src/parc/cloudParcHubBoot');
      const hubBoot = await bootstrapCloudParcMqttHub(registry);
      if (hubBoot.started) {
        console.log(`[mqtt-parc] cloud central hub connected → ${hubBoot.brokerUrl || hubBoot.status?.brokerUrl || 'broker'}`);
        mongoSysLog.maintenance('mqtt-parc', 'Cloud central MQTT hub connected', {
          brokerUrl: hubBoot.brokerUrl || hubBoot.status?.brokerUrl,
        });
      } else if (hubBoot.error) {
        console.warn('[mqtt-parc] cloud hub start:', hubBoot.error);
        mongoSysLog.error('mqtt-parc', 'Cloud hub start failed', { error: hubBoot.error });
      } else if (hubBoot.skipped) {
        console.log(`[mqtt-parc] cloud hub not started: ${hubBoot.skipped}`);
      }
    } catch (e) {
      console.warn('[mqtt-parc] cloud hub boot:', e.message || e);
      mongoSysLog.error('mqtt-parc', 'Cloud hub boot failed', { message: e.message || String(e) });
    }
  }

  const port = process.env.PORT || settings.port || DEFAULT_PORT;

  let httpServer;
  await new Promise((resolve, reject) => {
    httpServer = app.listen(port, '0.0.0.0');
    httpServer.once('listening', () => {
      try {
        fs.writeFileSync(path.join(DATA_DIR, 'peaklogic.pid'), String(process.pid), 'utf8');
      } catch { /* ignore */ }
      resolve();
    });
    httpServer.once('error', (err) => {
      if (err?.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use — run "npm stop" in est-pc, then "npm start"`,
        ));
      } else {
        reject(err);
      }
    });
  });
  try {
    const { attachLiveWebSocket } = require('./src/live/liveWebSocket');
    attachLiveWebSocket(httpServer, { tagStore, driverManager, scanEngine });
  } catch (e) {
    console.warn('[live-ws] attach failed (HTTP GET /api/live remains):', e.message || e);
  }
  console.log(`PeakLogic MVP Suite  http://127.0.0.1:${port}`);
  console.log(`Data: ${DATA_DIR}`);
  console.log(`ST programs: ${ST_DIR}`);
  console.log(`API JSON body limit: ${REQUEST_JSON_LIMIT}`);

  const { resolveMongoLoggerForDeployment } = require('./src/settings/mongoLoggerSettings');
  const envUri = String(process.env.MONGODB_URI || process.env.MONGO_URL || '').trim();
  let mongoLogger = resolveMongoLoggerForDeployment(settings.mongoLogger, DEPLOYMENT_MODE);
  if (!mongoLogger?.uri && envUri && envUri !== 'memory') {
    mongoLogger = resolveMongoLoggerForDeployment({}, DEPLOYMENT_MODE);
  }
  if (mongoLogger?.uri) {
    try {
      await mongoTagLogger.setConfig(mongoLogger);
      await hardwareHistoryStore.setConfig(mongoLogger);
      await mongoSysLog.setConfig(mongoLogger);
    } catch (e) {
      console.warn('[mongo] startup connect:', e.message || e);
      mongoSysLog.error('mongo', 'startup connect failed', { message: e.message || String(e) });
    }
  } else {
    await mongoSysLog.setConfig(null);
  }
  const mqttLogTail = mosquittoLogIngest.startFromEnv();
  if (mqttLogTail?.tailer?.running) {
    console.log(`[mqtt-log] tailing Mosquitto log → sys_log (${mqttLogTail.tailer.path})`);
    mongoSysLog.maintenance('mqtt', 'Mosquitto log tailer started', { path: mqttLogTail.tailer.path });
  }
  mongoSysLog.maintenance('boot', 'PeakLogic started', {
    product: PRODUCT,
    deployment: DEPLOYMENT_MODE,
    tenantId: TENANT_ID,
    dataDir: DATA_DIR,
    port,
  });
  try {
    if (!IS_CLOUD) {
      const imported = await hardwareHistoryStore.importFromDriverHistories(driverManager.list());
      if (imported.imported > 0) {
        console.log(`[hardware-history] imported ${imported.imported} assignment(s) from drivers`);
        mongoSysLog.maintenance('hardware-history', 'Imported driver hardware assignments', imported);
      }
    }
  } catch (e) {
    console.warn('[hardware-history] import:', e.message || e);
    mongoSysLog.warn('hardware-history', 'Import from drivers failed', { message: e.message || String(e) });
  }
  if (!IS_CLOUD) {
  try {
    await driverManager.rebuild({ connectDeferred: true });
  } catch (e) {
    console.warn('[drivers] rebuild at startup:', e.message || e);
    mongoSysLog.error('drivers', 'Rebuild at startup failed', { message: e.message || String(e) });
  }
  const recon = reconcileMqttParcDriversFromRegistry(driverManager.list(), registry);
  if (recon.changed) {
    driverManager.save(recon.drivers);
    patchWorkspaceDrivers(recon.drivers);
    console.log(`[mqtt-parc] restored driver(s) from Parc registry: ${recon.added.join(', ')}`);
    try {
      await driverManager.rebuild({ connectDeferred: true });
    } catch (e) {
      console.warn('[drivers] rebuild after registry restore:', e.message || e);
    }
  }
  const bootMqtt = await bootstrapMqttParc({
    settings,
    drivers: driverManager.list(),
    driverManager,
    tagStore,
  });
  const mergedSettings = bootMqtt.settings || settings;
  if (bootMqtt.changed) {
    scanEngine.loadSettings();
  }
  if (bootMqtt.hub?.started) {
    console.log('[mqtt-parc] central hub connected');
    mongoSysLog.maintenance('mqtt-parc', 'Central MQTT hub connected', { brokerUrl: bootMqtt.hub?.brokerUrl });
    const { optaBrokerHint } = require('./src/parc/mqttBrokerHint');
    const brokerHint = optaBrokerHint();
    if (brokerHint.lanIp !== '127.0.0.1') {
      console.log(`[mqtt-parc] Opta /setup broker → ${brokerHint.optaBrokerIp}:1883 (PeakLogic Mosquitto LAN)`);
    } else {
      console.log(`[mqtt-parc] Opta /setup broker → gateway LAN IP:1883 (hub uses ${bootMqtt.hub?.status?.brokerUrl || 'mqtt://127.0.0.1:1883'})`);
    }
    driverManager.linkMqttParcDriversIfHubLive()
      .then((linked) => {
        const n = linked.filter((r) => r.ok && !r.skipped).length;
        if (n) console.log(`[mqtt-parc] auto-linked ${n} driver(s)`);
      })
      .catch((e) => {
        console.warn('[mqtt-parc] auto-link drivers:', e.message || e);
      });
  } else if (mergedSettings.mqttParc?.enabled && bootMqtt.hub?.error) {
    console.warn('[mqtt-parc] hub start:', bootMqtt.hub.error);
    mongoSysLog.error('mqtt-parc', 'Hub start failed', { error: bootMqtt.hub.error });
  } else if (bootMqtt.hub?.skipped) {
    const why = hubBootSkipReason(mergedSettings, driverManager.list());
    console.log(`[mqtt-parc] hub not started${why ? `: ${why}` : ''}`);
    mongoSysLog.info('mqtt-parc', 'Hub not started on boot', { reason: why });
  }
  if (shouldAutoStartRuntime(mergedSettings)) {
    const activeRel = programStore.ensureActiveProgram();
    if (!activeRel) {
      console.warn('[boot] runtime auto-start skipped: no activeProgram in settings or workspace');
    } else if (!programStore.readActive()?.trim()) {
      console.warn(`[boot] runtime auto-start skipped: ST file missing for ${activeRel}`);
    } else {
      const bootDeployDelayMs = Math.max(0, Number(mergedSettings.bootParcDeployDelayMs) || 8000);
      if (bootDeployDelayMs > 0 && mergedSettings.remoteExecution) {
        console.log(`[boot] waiting ${bootDeployDelayMs}ms before Parc deploy (Opta cmd link settle)`);
        await new Promise((r) => setTimeout(r, bootDeployDelayMs));
      }
      try {
        await scanEngine.start();
        console.log(`[boot] runtime started (driver polling + historian) — ${activeRel}`);
        mongoSysLog.maintenance('runtime', 'Runtime auto-started on boot', { activeProgram: activeRel });
      } catch (e) {
        console.warn('[boot] runtime auto-start failed:', e.message || e);
        mongoSysLog.error('runtime', 'Runtime auto-start failed', { message: e.message || String(e), activeProgram: activeRel });
      }
    }
  } else {
    const why = mergedSettings.autoStartRuntime === false
      ? 'autoStartRuntime=false — enable in Historian → Logger config or System setup → General'
      : 'autoStartRuntime not enabled — enable in Historian → Logger config';
    console.log(`[boot] runtime auto-start skipped: ${why}`);
  }
  }
  if (!IS_CLOUD && settings.pdm?.buildEnabled) {
    setBatchScheduler(startPdmBatchScheduler(() => persistence.readJson('settings.json', {})));
    console.log('[pdm] nightly feature batch enabled');
  }
  if (isCloudSimsEnabled()) {
    try {
      const simInit = await simManager.init();
      console.log(`[cloud-sims] manager ready (${simInit.count ?? 0} sim(s), store=${simInit.store?.backend || 'json'})`);
    } catch (e) {
      console.warn('[cloud-sims] init:', e.message || e);
    }
  }
  process.on('SIGINT', async () => {
    removePidFile();
    mosquittoLogIngest.stopTailer();
    await simManager.shutdown().catch(() => {});
    await configStore.shutdown().catch(() => {});
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    removePidFile();
    mosquittoLogIngest.stopTailer();
    await simManager.shutdown().catch(() => {});
    await configStore.shutdown().catch(() => {});
    process.exit(0);
  });
  process.on('unhandledRejection', (err) => {
    console.error('[unhandledRejection]', err?.message || err);
  });
}

boot().catch((e) => {
  console.error(e);
  mongoSysLog.error('boot', 'PeakLogic boot failed', { message: e.message || String(e), stack: e.stack });
  process.exit(1);
});

function removePidFile() {
  try {
    fs.unlinkSync(path.join(DATA_DIR, 'peaklogic.pid'));
  } catch { /* ignore */ }
}

process.on('exit', removePidFile);

module.exports = { app, get tagStore() { return tagStore; }, get driverManager() { return driverManager; }, get scanEngine() { return scanEngine; }, get graphHistory() { return graphHistory; } };

'use strict';

process.env.PEAKLOGIC_DEPLOYMENT = process.env.PEAKLOGIC_DEPLOYMENT || 'appliance';

const path = require('path');
const express = require('express');
const { DEFAULT_PORT, DATA_DIR, ST_DIR } = require('./src/config');
const persistence = require('./src/persistence');
const { TagStore } = require('./src/tags/tagStore');
const { DriverManager } = require('./src/drivers');
const { ScanEngine } = require('./src/runtime/scanEngine');
const { GraphHistory } = require('./src/runtime/graphHistory');
const { createExpressApi } = require('./src/api/expressRouter');
const programStore = require('./src/programs/programStore');
const mongoTagLogger = require('./src/logger/mongoTagLogger');
const { registry } = require('./src/fleet/deviceRegistry');
const { getMqttCentralHub } = require('./src/fleet/mqttCentralHub');

const tagStore = new TagStore();
const driverManager = new DriverManager(tagStore);
const graphHistory = new GraphHistory();
const scanEngine = new ScanEngine(tagStore, driverManager, graphHistory);

const { version: APP_VERSION } = require('./package.json');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use('/api', createExpressApi({ tagStore, driverManager, scanEngine, graphHistory }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'PeakLogic',
    product: 'cloud',
    version: APP_VERSION,
    runtime: scanEngine.status(),
    dataDir: DATA_DIR,
    stDir: ST_DIR,
    mongo: mongoTagLogger.status(),
    fleet: getMqttCentralHub(registry).status(),
  });
});

app.get('/', (req, res) => {
  res.type('text/plain').send(
    `PeakLogic Cloud ${APP_VERSION}\nAPI: /api/dashboard\nHealth: /health\nUse peaklogic-client for operator UI.\n`
  );
});

async function boot() {
  persistence.ensureDataDir();
  programStore.migrateLegacyProgram();
  const settings = persistence.readJson('settings.json', {});
  const port = process.env.PORT || settings.port || DEFAULT_PORT;
  if (settings.graphMaxPoints) graphHistory.setMaxPoints(settings.graphMaxPoints);
  scanEngine.loadSettings();
  if (settings.mongoLogger?.uri) {
    try {
      await mongoTagLogger.setConfig(settings.mongoLogger);
    } catch (e) {
      console.warn('[mongo] startup connect:', e.message || e);
    }
  }
  try {
    await driverManager.rebuild();
  } catch (e) {
    console.warn('[drivers] rebuild at startup:', e.message || e);
  }
  if (settings.mqttFleet?.enabled) {
    try {
      await getMqttCentralHub(registry).start(settings.mqttFleet);
      console.log('[mqtt-fleet] central hub connected');
    } catch (e) {
      console.warn('[mqtt-fleet] hub start:', e.message || e);
    }
  }
  process.on('unhandledRejection', (err) => {
    console.error('[unhandledRejection]', err?.message || err);
  });
  app.listen(port, '0.0.0.0', () => {
    console.log(`PeakLogic Cloud  http://0.0.0.0:${port}  (API + historian + fleet)`);
    console.log(`Data: ${DATA_DIR}`);
    console.log(`ST programs: ${ST_DIR}`);
  });
}

boot().catch((e) => {
  console.error(e);
  process.exit(1);
});

module.exports = { app, tagStore, driverManager, scanEngine, graphHistory };

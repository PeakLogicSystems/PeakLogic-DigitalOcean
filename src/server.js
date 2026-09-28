'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { DEFAULT_PORT, LIVE_WS_INTERVAL_MS } = require('./config');
const { TagStore } = require('./tags/tagStore');
const { DriverManager } = require('./drivers');
const { ScanEngine } = require('./runtime/scanEngine');
const { GraphHistory } = require('./runtime/graphHistory');
const { createRouter } = require('./http/router');
const { createApiRoutes } = require('./api/routes');
const persistence = require('./persistence');
const { sanitizeLegacyProjectHwDefaultsOnDisk } = require('./settings/portableSettings');

const tagStore = new TagStore();
const driverManager = new DriverManager(tagStore);
const graphHistory = new GraphHistory();
const scanEngine = new ScanEngine(tagStore, driverManager, graphHistory);
const { registerParcRecoveryDeps } = require('./parc/parcDeviceRecovery');
const { getMqttCentralHub } = require('./parc/mqttCentralHub');
const { registry } = require('./parc/deviceRegistry');
registerParcRecoveryDeps({ scanEngine, driverManager });
getMqttCentralHub(registry).setGlobalMirrorDeps({ tagStore });

const apiHandlers = createApiRoutes({
  tagStore,
  driverManager,
  scanEngine,
  graphHistory,
  sendJson: (res, status, body) => {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  },
});

const router = createRouter(apiHandlers);

const server = http.createServer((req, res) => router(req, res));

const wss = new WebSocketServer({ server, path: '/api/live' });

wss.on('connection', (ws) => {
  const iv = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        tags: tagStore.liveSnapshot(),
        runtime: scanEngine.status(),
        graph: graphHistory.getHistory(null, 120),
      }));
    }
  }, LIVE_WS_INTERVAL_MS);
  ws.on('close', () => clearInterval(iv));
});

async function boot() {
  persistence.ensureDataDir();
  if (await sanitizeLegacyProjectHwDefaultsOnDisk(persistence)) {
    console.log('[boot] removed legacy project RTU defaults from data files');
  }
  const { initMongoServicesFromSettings } = require('./logger/mongoServicesInit');
  await initMongoServicesFromSettings().catch((e) => {
    console.warn('[boot] MongoDB services:', e.message || e);
  });
  const settings = persistence.readJson('settings.json', {});
  const port = settings.port || DEFAULT_PORT;
  await driverManager.rebuild();
  server.listen(port, '0.0.0.0', () => {
    console.log(`PeakLogic listening on :${port}`);
  });
}

boot().catch((e) => {
  console.error(e);
  process.exit(1);
});

module.exports = { server, tagStore, driverManager, scanEngine, graphHistory };

#!/usr/bin/env node

'use strict';

/**
 * Automated smoke verification for PeakLogic Mongo config, projects, and stack health.
 *
 * Usage:
 *   npm run verify-stack
 *   PEAKLOGIC_CONFIG_URI=mongodb://127.0.0.1:27017 npm run verify-stack
 *
 * Uses an isolated temp data dir and test Mongo database. Optionally probes a live server
 * on PORT when reachable (GET /health, GET /api/projects).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { MongoClient } = require('mongodb');

const results = [];

function record(label, ok, detail = '', optional = false) {
  results.push({ label, ok, detail, optional });
  const tag = ok ? 'PASS' : (optional ? 'SKIP' : 'FAIL');
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`${tag}  ${label}${suffix}`);
}

function httpGetJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(body) });
        } catch {
          reject(new Error(`invalid JSON from ${url}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function dropTestDatabase(uri, testDb) {
  const client = new MongoClient(uri, { maxPoolSize: 2 });
  try {
    await client.connect();
    await client.db(testDb).dropDatabase();
  } catch {
    /* ignore cleanup errors */
  } finally {
    await client.close();
  }
}

async function runInProcessChecks(uri, testDb, tmpDir) {
  process.env.PEAKLOGIC_DATA = tmpDir;
  process.env.PEAKLOGIC_CONFIG_URI = uri;
  process.env.PEAKLOGIC_CONFIG_DB = testDb;
  delete process.env.MONGODB_URI;
  delete process.env.MONGO_URL;

  const { DEFAULT_PORT } = require('../src/config');
  const configStore = require('../src/configStore');
  const persistence = require('../src/persistence');
  const mongoBackend = require('../src/configStore/mongoBackend');
  const { CONFIG_JSON_FILES } = require('../src/configStore/keys');
  const { normalizeHmi, defaultDemoHmi } = require('../src/hmi/hmiConfig');
  const { pack, apply } = require('../src/project/estFile');
  const { seedDefaultProjectIfEmpty } = require('../src/configStore/seedDefaultProject');
  const { TagStore } = require('../src/tags/tagStore');
  const { DriverManager } = require('../src/drivers');
  const { ScanEngine } = require('../src/runtime/scanEngine');
  const { GraphHistory } = require('../src/runtime/graphHistory');

  let init;
  try {
    init = await configStore.init();
    record('Mongo config connection', init.backend === 'mongo', init.backend || 'unknown backend');
  } catch (e) {
    record('Mongo config connection', false, e.message || String(e));
    return DEFAULT_PORT;
  }

  const probeKey = `__verify_stack_${Date.now()}`;
  try {
    await mongoBackend.writeDocument(probeKey, { probe: true, at: Date.now() });
    const row = await mongoBackend.readDocument(probeKey);
    record('Mongo config read/write roundtrip', row?.data?.probe === true);
  } catch (e) {
    record('Mongo config read/write roundtrip', false, e.message || String(e));
  }

  const tagStore = new TagStore();
  const driverManager = new DriverManager(tagStore);
  tagStore.load();
  driverManager.reloadFromPersistence();

  const seeded = await seedDefaultProjectIfEmpty({ tagStore, driverManager });
  const projectsAfterSeed = configStore.listProjectsSync();
  record(
    'Default project seeded when library empty',
    seeded?.id === 'default' && projectsAfterSeed.some((p) => p.id === 'default'),
    seeded ? `id=${seeded.id}, library=${projectsAfterSeed.length}` : 'library not empty or seed skipped',
  );

  const graphHistory = new GraphHistory();
  const scanEngine = new ScanEngine(tagStore, driverManager, graphHistory);
  let startupLoaded = false;
  let startupDetail = '';
  try {
    const snap = await mongoBackend.readProjectSnapshot('default');
    if (!snap?.data) {
      startupDetail = 'default project snapshot missing';
    } else {
      await apply(snap.data, { tagStore, driverManager, scanEngine, persistence, graphHistory });
      startupLoaded = true;
      startupDetail = `mode=saved_project, name=${snap.data.project?.name || 'default'}`;
    }
  } catch (e) {
    startupDetail = e.message || String(e);
  }
  record(
    'Startup load on boot simulation',
    startupLoaded,
    startupDetail,
  );

  const settings = persistence.readJson('settings.json', {});
  const startupOk = settings.startup?.mode === 'saved_project'
    && settings.startup?.projectId === 'default';
  const runtimeOk = settings.autoStartRuntime === true;
  const mqttOk = settings.mqttParc?.enabled === true && settings.mqttParc?.autoDiscoverDrivers === true;
  record(
    'Startup settings (saved_project, autoStartRuntime, mqttParc)',
    startupOk && runtimeOk && mqttOk,
    `mode=${settings.startup?.mode}, projectId=${settings.startup?.projectId}, autoStart=${settings.autoStartRuntime}, mqtt=${settings.mqttParc?.enabled}`,
  );

  const requiredDocs = ['settings.json', 'tags.json', 'drivers.json'];
  const missingDocs = requiredDocs.filter((key) => persistence.readJson(key, null) == null);
  record(
    'Config documents present after seed',
    missingDocs.length === 0,
    missingDocs.length ? `missing: ${missingDocs.join(', ')}` : `keys ok (${CONFIG_JSON_FILES.size} config files tracked)`,
  );

  const testTag = { id: 'VERIFY_TAG', type: 'BOOL', role: 'memory', value: false };
  const testDriver = { id: 'verify_mock', type: 'mock', enabled: false };
  persistence.writeJson('tags.json', [testTag]);
  persistence.writeJson('drivers.json', [testDriver]);
  await persistence.flushConfig();

  const saveDoc = pack({ tagStore, driverManager, persistence }, { name: 'verify-stack' });
  saveDoc.tags = [testTag];
  saveDoc.drivers = [testDriver];
  const saved = await mongoBackend.writeProjectSnapshot('verify-stack', saveDoc, { name: 'verify-stack' });
  await configStore.refreshProjectIndex();
  const listed = configStore.listProjectsSync();
  const listOk = listed.some((p) => p.id === saved.id);
  let loadOk = false;
  let loadDetail = '';
  try {
    const row = await mongoBackend.readProjectSnapshot(saved.id);
    const loaded = row?.data;
    loadOk = loaded?.tags?.some((t) => t.id === 'VERIFY_TAG')
      && loaded?.drivers?.some((d) => d.id === 'verify_mock');
    if (!loadOk) loadDetail = 'tag/driver mismatch in loaded doc';
  } catch (e) {
    loadDetail = e.message || String(e);
  }
  record(
    'Project save/list/load cycle',
    listOk && loadOk,
    loadDetail || `saved=${saved.id}, listed=${listOk}, tags/drivers roundtrip=${loadOk}`,
  );

  const tagsRow = await mongoBackend.readDocument('tags.json');
  const driversRow = await mongoBackend.readDocument('drivers.json');
  const tagsPersisted = Array.isArray(tagsRow?.data) && tagsRow.data.some((t) => t.id === 'VERIFY_TAG');
  const driversPersisted = Array.isArray(driversRow?.data) && driversRow.data.some((d) => d.id === 'verify_mock');
  record(
    'Tags/drivers persistence through Mongo',
    tagsPersisted && driversPersisted,
    `tags=${tagsRow?.data?.length ?? 0}, drivers=${driversRow?.data?.length ?? 0}`,
  );

  const status = configStore.status();
  record(
    'Health config.backend reports mongo',
    status.backend === 'mongo' && status.ready === true,
    `backend=${status.backend}, ready=${status.ready}`,
  );

  const settingsForHmi = persistence.readJson('settings.json', {});
  const tagsForHmi = persistence.readJson('tags.json', []);
  const hmiSrc = settingsForHmi.hmi?.screens?.length ? settingsForHmi.hmi : defaultDemoHmi();
  const hmi = normalizeHmi(hmiSrc, tagsForHmi);
  const hmiOk = Array.isArray(hmi.screens) && hmi.screens.length > 0
    && hmi.screens.every((s) => s.id && Number.isFinite(Number(s.number)));
  record(
    'HMI config normalized (settings.hmi.screens)',
    hmiOk,
    `screens=${hmi.screens?.length || 0}, active=${hmi.activeScreen || '(none)'}`,
  );

  await configStore.shutdown();
  return Number(process.env.PORT) || DEFAULT_PORT;
}

async function runHttpChecks(port) {
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await httpGetJson(`${base}/health`);
    const ok = health.status === 200
      && health.json?.ok === true
      && health.json?.config?.backend === 'mongo';
    record(
      'HTTP /health (live server)',
      ok,
      ok ? `product=${health.json.product}, tenant=${health.json.tenantId}` : `status=${health.status}`,
      true,
    );
  } catch (e) {
    record('HTTP /health (live server)', false, `not reachable — ${e.message || e}`, true);
    return;
  }

  try {
    const projects = await httpGetJson(`${base}/api/projects`);
    const ok = projects.status === 200 && Array.isArray(projects.json?.projects);
    record(
      'HTTP /api/projects (live server)',
      ok,
      ok ? `${projects.json.projects.length} project(s)` : `status=${projects.status}`,
      true,
    );
  } catch (e) {
    record('HTTP /api/projects (live server)', false, e.message || String(e), true);
  }
}

async function main() {
  const uri = String(process.env.PEAKLOGIC_CONFIG_URI || process.env.MONGODB_URI || '').trim();
  if (!uri || uri === 'memory') {
    record('Mongo URI configured', false, 'Set PEAKLOGIC_CONFIG_URI or MONGODB_URI (not memory)');
    console.log('');
    console.log(`Result: ${results.filter((r) => r.ok).length}/${results.length} passed`);
    process.exit(1);
  }

  const testDb = process.env.PEAKLOGIC_VERIFY_DB || `mv_verify_${Date.now()}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-verify-stack-'));

  console.log('PeakLogic verify-stack');
  console.log(`  mongo: ${uri}`);
  console.log(`  test db: ${testDb}`);
  console.log(`  temp data: ${tmpDir}`);
  console.log('');

  let port = Number(process.env.PORT) || 3090;
  try {
    port = await runInProcessChecks(uri, testDb, tmpDir);
    console.log(`  live server probe: http://127.0.0.1:${port}`);
    console.log('');
    await runHttpChecks(port);
  } finally {
    await dropTestDatabase(uri, testDb);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.optional);
  const skipped = results.filter((r) => !r.ok && r.optional);
  console.log('');
  console.log(`Result: ${passed}/${results.length} passed (${skipped.length} optional skip)`);
  if (failed.length) {
    console.log('Failed checks:');
    for (const row of failed) {
      console.log(`  - ${row.label}${row.detail ? `: ${row.detail}` : ''}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

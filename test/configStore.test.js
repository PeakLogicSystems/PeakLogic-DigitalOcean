'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}src${path.sep}config`)
      || key.includes(`${path.sep}src${path.sep}persistence`)
      || key.includes(`${path.sep}src${path.sep}configStore`)
      || key.includes(`${path.sep}src${path.sep}project${path.sep}`)
      || key.includes(`${path.sep}src${path.sep}programs${path.sep}`)
    ) {
      delete require.cache[key];
    }
  }
}

describe('configStore memory backend', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-config-mem-'));
    process.env.PEAKLOGIC_DATA = dir;
    process.env.PEAKLOGIC_CONFIG_URI = 'memory';
    clearModuleCache();
  });

  afterEach(async () => {
    try {
      const configStore = require('../src/configStore');
      await configStore.shutdown().catch(() => {});
    } catch { /* ignore */ }
    delete process.env.PEAKLOGIC_DATA;
    clearModuleCache();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('read/write roundtrip via persistence hook', async () => {
    const configStore = require('../src/configStore');
    const persistence = require('../src/persistence');
    await configStore.init();
    persistence.writeJson('settings.json', { scanMs: 333 });
    await configStore.flushPending();
    assert.equal(persistence.readJson('settings.json', {}).scanMs, 333);
  });

  it('seeds default saved project when library is empty', async () => {
    const configStore = require('../src/configStore');
    const persistence = require('../src/persistence');
    const { seedDefaultProjectIfEmpty } = require('../src/configStore/seedDefaultProject');
    const tagStore = { list: () => [], count: () => 0 };
    const driverManager = { list: () => [] };
    await configStore.init();
    const seeded = await seedDefaultProjectIfEmpty({ tagStore, driverManager });
    assert.ok(seeded);
    assert.equal(seeded.id, 'default');
    const projects = await configStore.refreshProjectIndex();
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, 'default');
    assert.ok(fs.existsSync(path.join(dir, 'projects', 'default.est.zip')));
    const settings = persistence.readJson('settings.json', {});
    assert.equal(settings.startup.mode, 'saved_project');
    assert.equal(settings.startup.projectId, 'default');
    assert.equal(settings.autoStartRuntime, true);
    assert.equal(settings.mqttParc.enabled, true);
    assert.equal(settings.mqttParc.autoDiscoverDrivers, true);
    assert.equal(settings.remoteExecution, true);
  });
});

describe('configStore mongo integration', () => {
  const rawUri = process.env.PEAKLOGIC_CONFIG_URI || process.env.MONGODB_URI || '';
  const uri = rawUri && rawUri !== 'memory' ? rawUri : '';
  if (!uri) {
    it('skipped — set MONGODB_URI to run integration test', () => {
      assert.ok(true);
    });
    return;
  }

  let dir;
  const testDb = `mv_config_test_${Date.now()}`;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-config-mongo-'));
    process.env.PEAKLOGIC_DATA = dir;
    process.env.PEAKLOGIC_CONFIG_URI = uri;
    process.env.PEAKLOGIC_CONFIG_DB = testDb;
    clearModuleCache();
  });

  after(async () => {
    const configStore = require('../src/configStore');
    await configStore.shutdown().catch(() => {});
    delete process.env.PEAKLOGIC_DATA;
    delete process.env.PEAKLOGIC_CONFIG_URI;
    delete process.env.PEAKLOGIC_CONFIG_DB;
    clearModuleCache();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('init connects and starts with empty cache when Mongo has no documents', async () => {
    const configStore = require('../src/configStore');
    const init = await configStore.init();
    assert.equal(init.backend, 'mongo');
    assert.equal(configStore.status().ready, true);
    const persistence = require('../src/persistence');
    assert.deepEqual(persistence.readJson('settings.json', { empty: true }), { empty: true });
  });

  it('persists config across process reload', async () => {
    const configStore = require('../src/configStore');
    const persistence = require('../src/persistence');
    await configStore.init();
    persistence.writeJson('settings.json', { scanMs: 222, project: { name: 'mongo-test' } });
    await configStore.flushPending();
    assert.equal(persistence.readJson('settings.json', {}).scanMs, 222);

    clearModuleCache();
    process.env.PEAKLOGIC_CONFIG_URI = uri;
    process.env.PEAKLOGIC_CONFIG_DB = testDb;
    process.env.PEAKLOGIC_DATA = dir;
    const configStore2 = require('../src/configStore');
    const persistence2 = require('../src/persistence');
    await configStore2.init();
    const settings2 = persistence2.readJson('settings.json', {});
    assert.equal(settings2.scanMs, 222);
    assert.equal(settings2.project.name, 'mongo-test');
    await configStore2.shutdown();
  });

  it('fails fast when Mongo URI is missing', async () => {
    delete process.env.PEAKLOGIC_CONFIG_URI;
    delete process.env.MONGODB_URI;
    clearModuleCache();
    const configStore = require('../src/configStore');
    await assert.rejects(
      () => configStore.init(),
      /MongoDB required for configuration/,
    );
    process.env.PEAKLOGIC_CONFIG_URI = uri;
  });
});

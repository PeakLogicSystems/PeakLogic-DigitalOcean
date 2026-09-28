'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-mongo-init-'));

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const persistence = require('../src/persistence');
const mongoSysLog = require('../src/logger/mongoSysLog');
const hardwareHistoryStore = require('../src/hardware/hardwareHistoryStore');
const mongoTagLogger = require('../src/logger/mongoTagLogger');
const { initMongoServicesFromSettings } = require('../src/logger/mongoServicesInit');

describe('mongo services init', () => {
  const prevUri = process.env.MONGODB_URI;

  after(async () => {
    if (prevUri == null) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = prevUri;
    await mongoSysLog.close();
    await hardwareHistoryStore.close();
    await mongoTagLogger.close?.();
  });

  it('configures syslog and hardware from env when settings omit mongoLogger', async () => {
    delete process.env.MONGODB_URI;
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017';
    persistence.writeJson('settings.json', { scanMs: 100 });
    await mongoSysLog.setConfig(null);
    await hardwareHistoryStore.setConfig(null);
    await mongoTagLogger.clearConfig();

    await initMongoServicesFromSettings();

    assert.equal(mongoSysLog.status().enabled, true);
    assert.equal(mongoSysLog.status().fallback, false);
    assert.equal(hardwareHistoryStore.status().enabled, true);
    assert.equal(hardwareHistoryStore.status().fallback, false);
    assert.equal(mongoTagLogger.status().enabled, true);
  });

  it('prefers mongoLogger saved in settings.json', async () => {
    persistence.writeJson('settings.json', {
      mongoLogger: { uri: 'mongodb://127.0.0.1:27017', db: 'peaklogic_test' },
    });
    await initMongoServicesFromSettings();
    assert.equal(mongoSysLog.status().db, 'peaklogic_test');
    assert.equal(hardwareHistoryStore.status().db, 'peaklogic_test');
  });
});

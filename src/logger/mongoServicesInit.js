'use strict';

const persistence = require('../persistence');
const mongoTagLogger = require('./mongoTagLogger');
const mongoSysLog = require('./mongoSysLog');
const hardwareHistoryStore = require('../hardware/hardwareHistoryStore');
const { normalizeMongoLogger } = require('../settings/mongoLoggerSettings');

async function applyMongoLoggerConfig(raw, prev = {}) {
  const ml = normalizeMongoLogger(raw, prev);
  if (ml.uri) {
    await mongoTagLogger.setConfig(ml);
    await hardwareHistoryStore.setConfig(ml);
    await mongoSysLog.setConfig(ml);
    return ml;
  }
  await mongoTagLogger.clearConfig();
  await hardwareHistoryStore.setConfig(null);
  await mongoSysLog.setConfig(null);
  return null;
}

/** Apply mongoLogger from settings.json (and env URI when settings omit it). */
async function initMongoServicesFromSettings() {
  const settings = persistence.readJson('settings.json', {});
  if (settings.mongoLogger?.uri) {
    return applyMongoLoggerConfig(settings.mongoLogger, settings);
  }
  const envUri = String(process.env.MONGODB_URI || process.env.MONGO_URL || '').trim();
  if (envUri && envUri !== 'memory') {
    return applyMongoLoggerConfig({
      uri: envUri,
      db: process.env.MONGODB_DB,
      collection: process.env.MONGODB_COLLECTION,
    }, settings);
  }
  return null;
}

module.exports = {
  applyMongoLoggerConfig,
  initMongoServicesFromSettings,
};

'use strict';

const DEFAULT_MONGO_LOGGER = {
  uri: 'mongodb://127.0.0.1:27017',
  db: 'peaklogic',
  collection: 'tag_logs',
  edgeCollection: 'edge_inference',
  sysLogCollection: 'sys_log',
  sampleIntervalMs: 5000,
};

function defaultMongoLogger() {
  return { ...DEFAULT_MONGO_LOGGER };
}

/** Stored config merged with defaults (for UI display and new projects). */
function effectiveMongoLogger(stored) {
  const ml = stored && typeof stored === 'object' ? stored : {};
  if (ml.uri) {
    return normalizeMongoLogger(ml, {});
  }
  return defaultMongoLogger();
}

function isLocalMongoUri(uri) {
  return /127\.0\.0\.1|localhost/i.test(String(uri || '').trim());
}

/** Cloud SaaS: tenant settings must not point logger at localhost when platform MONGODB_URI is set. */
function resolveMongoLoggerForDeployment(ml, deployment) {
  const normalized = ml?.uri
    ? normalizeMongoLogger(ml, {})
    : (ml && typeof ml === 'object' ? { ...ml } : {});
  const envUri = String(process.env.MONGODB_URI || process.env.MONGO_URL || '').trim();
  if (deployment === 'cloud' && envUri && envUri !== 'memory') {
    if (!normalized.uri || isLocalMongoUri(normalized.uri)) {
      return normalizeMongoLogger({
        ...normalized,
        uri: envUri,
        db: process.env.MONGODB_DB || normalized.db || 'peaklogic_cloud',
      }, {});
    }
  }
  return normalized.uri ? normalizeMongoLogger(normalized, {}) : {};
}

function normalizeMongoLogger(incoming, prev = {}) {
  const prevMl = prev?.mongoLogger && typeof prev.mongoLogger === 'object'
    ? prev.mongoLogger
    : {};
  if (incoming === null) return {};
  if (incoming === undefined) return { ...prevMl };
  if (typeof incoming !== 'object') return { ...prevMl };

  const hasUriKey = Object.prototype.hasOwnProperty.call(incoming, 'uri');
  const uri = hasUriKey
    ? String(incoming.uri || '').trim()
    : String(prevMl.uri || '').trim();

  if (!uri) {
    if (hasUriKey) return {};
    return { ...prevMl };
  }

  const db = String(incoming.db ?? prevMl.db ?? DEFAULT_MONGO_LOGGER.db).trim()
    || DEFAULT_MONGO_LOGGER.db;
  const collection = String(incoming.collection ?? prevMl.collection ?? DEFAULT_MONGO_LOGGER.collection).trim()
    || DEFAULT_MONGO_LOGGER.collection;
  const edgeCollection = String(incoming.edgeCollection ?? prevMl.edgeCollection ?? DEFAULT_MONGO_LOGGER.edgeCollection).trim()
    || DEFAULT_MONGO_LOGGER.edgeCollection;
  const sysLogCollection = String(incoming.sysLogCollection ?? prevMl.sysLogCollection ?? DEFAULT_MONGO_LOGGER.sysLogCollection).trim()
    || DEFAULT_MONGO_LOGGER.sysLogCollection;
  const sampleIntervalMs = Math.max(
    Number(incoming.sampleIntervalMs ?? prevMl.sampleIntervalMs ?? DEFAULT_MONGO_LOGGER.sampleIntervalMs)
      || DEFAULT_MONGO_LOGGER.sampleIntervalMs,
    1000
  );

  return { uri, db, collection, edgeCollection, sysLogCollection, sampleIntervalMs };
}

module.exports = {
  DEFAULT_MONGO_LOGGER,
  defaultMongoLogger,
  effectiveMongoLogger,
  normalizeMongoLogger,
  isLocalMongoUri,
  resolveMongoLoggerForDeployment,
};

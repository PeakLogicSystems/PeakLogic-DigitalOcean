#!/usr/bin/env node

'use strict';

/**
 * Clear Mongo config store for the current tenant (fresh slate for PeakLogic config).
 *
 * Usage:
 *   npm run fresh-start
 *   PEAKLOGIC_CONFIG_URI=mongodb://127.0.0.1:27017 npm run fresh-start
 *
 * Environment:
 *   PEAKLOGIC_CONFIG_URI / MONGODB_URI / MONGO_URL — Mongo connection (required, not "memory")
 *   PEAKLOGIC_CONFIG_DB — config database (default: peaklogic_config)
 *   PEAKLOGIC_TENANT_ID — tenant scope (default: local)
 *   PEAKLOGIC_FRESH_START_CLEAR_HISTORIAN=1 — also clear historian sample collections
 *   MONGODB_DB / MONGODB_COLLECTION / MONGODB_EDGE_COLLECTION — historian targets when clearing
 *
 * Does NOT delete:
 *   - ST programs on disk (st/ or PEAKLOGIC_ST)
 *   - HMI asset files (public/hmi, data/hmi-imports)
 *
 * After running:
 *   1. Restart PeakLogic (npm start) — config re-seeds from data/ when present, else empty library
 *   2. npm run verify-stack — automated smoke checks
 *   3. Verify each subsystem in the browser (see verify-stack output checklist)
 */

const { MongoClient } = require('mongodb');
const {
  CONFIG_URI,
  CONFIG_DB,
  CONFIG_COLLECTION,
  CONFIG_PROJECTS_COLLECTION,
  TENANT_ID,
  DATA_DIR,
  ST_DIR,
} = require('../src/config');
const { DEFAULT_MONGO_LOGGER } = require('../src/settings/mongoLoggerSettings');
const { DEFAULT_PDM } = require('../src/settings/pdmSettings');

function historianUri() {
  return String(
    process.env.PEAKLOGIC_HISTORIAN_URI
    || process.env.MONGODB_URI
    || process.env.MONGO_URL
    || CONFIG_URI,
  ).trim();
}

function historianDbName() {
  return String(process.env.MONGODB_DB || DEFAULT_MONGO_LOGGER.db).trim() || DEFAULT_MONGO_LOGGER.db;
}

async function clearConfigCollections(db) {
  const configFilter = { tenantId: TENANT_ID };
  const configResult = await db.collection(CONFIG_COLLECTION).deleteMany(configFilter);
  const projectsResult = await db.collection(CONFIG_PROJECTS_COLLECTION).deleteMany(configFilter);
  return {
    configDocuments: configResult.deletedCount,
    projectSnapshots: projectsResult.deletedCount,
  };
}

async function clearHistorianCollections(client) {
  const dbName = historianDbName();
  const db = client.db(dbName);
  const tagCollection = String(process.env.MONGODB_COLLECTION || DEFAULT_MONGO_LOGGER.collection).trim()
    || DEFAULT_MONGO_LOGGER.collection;
  const edgeCollection = String(process.env.MONGODB_EDGE_COLLECTION || DEFAULT_MONGO_LOGGER.edgeCollection).trim()
    || DEFAULT_MONGO_LOGGER.edgeCollection;
  const featuresCollection = String(process.env.MONGODB_PDM_FEATURES_COLLECTION || DEFAULT_PDM.featuresCollection).trim()
    || DEFAULT_PDM.featuresCollection;

  const cleared = {};
  for (const name of [tagCollection, edgeCollection, featuresCollection]) {
    const col = db.collection(name);
    const result = await col.deleteMany({});
    cleared[`${dbName}.${name}`] = result.deletedCount;
  }
  return cleared;
}

async function main() {
  const uri = String(CONFIG_URI || '').trim();
  if (!uri || uri === 'memory') {
    console.error('Set PEAKLOGIC_CONFIG_URI or MONGODB_URI to a real MongoDB server (not "memory").');
    process.exit(1);
  }

  const clearHistorian = process.env.PEAKLOGIC_FRESH_START_CLEAR_HISTORIAN === '1'
    || process.env.PEAKLOGIC_FRESH_START_CLEAR_HISTORIAN === 'true';

  console.log('PeakLogic fresh-start');
  console.log(`  tenant: ${TENANT_ID}`);
  console.log(`  config db: ${CONFIG_DB}`);
  console.log(`  collections: ${CONFIG_COLLECTION}, ${CONFIG_PROJECTS_COLLECTION}`);
  console.log(`  data dir: ${DATA_DIR} (on-disk JSON not deleted)`);
  console.log(`  ST dir: ${ST_DIR} (programs not deleted)`);
  console.log(`  clear historian: ${clearHistorian ? 'yes' : 'no (set PEAKLOGIC_FRESH_START_CLEAR_HISTORIAN=1 to wipe)'}`);
  console.log('');

  const client = new MongoClient(uri, { maxPoolSize: 4 });
  try {
    await client.connect();
    const db = client.db(CONFIG_DB);
    const cleared = await clearConfigCollections(db);

    console.log('Cleared Mongo config:');
    console.log(`  ${CONFIG_COLLECTION}: ${cleared.configDocuments} document(s)`);
    console.log(`  ${CONFIG_PROJECTS_COLLECTION}: ${cleared.projectSnapshots} snapshot(s)`);

    if (clearHistorian) {
      const histUri = historianUri();
      let histClient = client;
      if (histUri !== uri) {
        histClient = new MongoClient(histUri, { maxPoolSize: 4 });
        await histClient.connect();
      }
      const histCleared = await clearHistorianCollections(histClient);
      console.log('');
      console.log('Cleared historian collections:');
      for (const [key, count] of Object.entries(histCleared)) {
        console.log(`  ${key}: ${count} document(s)`);
      }
      if (histClient !== client) await histClient.close();
    }

    console.log('');
    console.log('Not deleted (by design):');
    console.log('  ST programs on disk');
    console.log('  HMI assets (public/hmi, data/hmi-imports)');
    console.log('  Local data/*.json files (server may re-import these on next boot if still present)');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Stop the server if running: npm run stop');
    console.log('  2. Optional: remove stale data/*.json to avoid re-import from disk');
    console.log('  3. Start PeakLogic: npm start');
    console.log('  4. Run smoke checks: npm run verify-stack');
    console.log('  5. Verify UI: default project seed, startup load, save/open, tags/drivers, HMI, runtime, MQTT Parc');
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

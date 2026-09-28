'use strict';

const { MongoClient } = require('mongodb');
const { MONGODB_URI, MONGODB_DB, DOCUMENTDB_ENABLED } = require('../config');

let client = null;
let db = null;
let connecting = null;

function isDocumentDbUri(uri) {
  return uri.includes('.mongocluster.cosmos.azure.com')
    || uri.includes('.mongo.cosmos.azure.com');
}

/**
 * Azure DocumentDB (MongoDB vCore) requires retryWrites=false.
 * @param {string} uri
 */
function clientOptions(uri) {
  if (DOCUMENTDB_ENABLED || isDocumentDbUri(uri)) {
    return { retryWrites: false };
  }
  return {};
}

/**
 * Connect to Azure DocumentDB or MongoDB (singleton).
 * Uses the native MongoDB driver — DocumentDB is wire-compatible.
 * @returns {Promise<import('mongodb').Db>}
 */
async function connectMongo() {
  if (db) return db;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI (or DOCUMENTDB_URI) is required');
  }
  if (connecting) return connecting;

  connecting = (async () => {
    const opts = clientOptions(MONGODB_URI);
    client = new MongoClient(MONGODB_URI, opts);
    await client.connect();
    db = client.db(MONGODB_DB);
    const backend = isDocumentDbUri(MONGODB_URI) || DOCUMENTDB_ENABLED ? 'Azure DocumentDB' : 'MongoDB';
    console.log(`[db] connected (${backend}) database=${MONGODB_DB}`);
    return db;
  })();

  try {
    return await connecting;
  } catch (err) {
    connecting = null;
    throw err;
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not connected — call connectMongo() first');
  }
  return db;
}

async function closeMongo() {
  if (client) {
    await client.close();
  }
  client = null;
  db = null;
  connecting = null;
}

/** Test helper — drop connection so the next connectMongo() uses a new URI. */
async function resetMongo() {
  await closeMongo();
}

module.exports = {
  connectMongo,
  getDb,
  closeMongo,
  resetMongo,
  isDocumentDbUri,
};

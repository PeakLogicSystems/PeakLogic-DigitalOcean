'use strict';

const { MongoClient } = require('mongodb');
const { MONGODB_URI, MONGODB_DB } = require('../config');

let client = null;
let db = null;
let connecting = null;

/**
 * Connect to MongoDB (singleton). TLS is negotiated from the URI (e.g. mongodb+srv on DO).
 * @returns {Promise<import('mongodb').Db>}
 */
async function connectMongo() {
  if (db) return db;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }
  if (connecting) return connecting;

  connecting = (async () => {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(MONGODB_DB);
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
    throw new Error('MongoDB not connected — call connectMongo() first');
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

module.exports = { connectMongo, getDb, closeMongo, resetMongo };

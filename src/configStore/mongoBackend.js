'use strict';



const { MongoClient } = require('mongodb');

const {
  CONFIG_URI,
  CONFIG_DB,
  CONFIG_COLLECTION,
  CONFIG_PROJECTS_COLLECTION,
} = require('../config');

function resolveConfigTenantId() {
  return require('../project/projectTenantContext').resolveConfigTenantId();
}



let client = null;

let db = null;

let connecting = null;



/** In-memory store for unit tests (PEAKLOGIC_CONFIG_URI=memory). */

const memoryDocs = new Map();

const memoryProjects = new Map();



function uri() {

  return CONFIG_URI;

}



function isMemoryMode() {

  return uri() === 'memory';

}



function resetMemory() {

  memoryDocs.clear();

  memoryProjects.clear();

}



async function connect() {

  const u = uri();

  if (u === 'memory') return { memory: true };

  if (!u) {

    throw new Error(

      'MongoDB required for configuration — set PEAKLOGIC_CONFIG_URI or MONGODB_URI (e.g. mongodb://127.0.0.1:27017)',

    );

  }

  if (db) return db;

  if (connecting) return connecting;

  connecting = (async () => {
    try {
      client = new MongoClient(u, { maxPoolSize: 8 });

      await client.connect();

      db = client.db(CONFIG_DB);

      await db.collection(CONFIG_COLLECTION).createIndex({ tenantId: 1, key: 1 }, { unique: true });

      await db.collection(CONFIG_PROJECTS_COLLECTION).createIndex({ tenantId: 1, projectId: 1 }, { unique: true });

      await db.collection(CONFIG_PROJECTS_COLLECTION).createIndex({ tenantId: 1, savedAt: -1 });

      return db;
    } catch (err) {
      client = null;
      db = null;
      const msg = String(err?.message || err);
      if (err?.code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
        throw new Error(
          `Cannot connect to MongoDB at ${u} — start MongoDB locally or set PEAKLOGIC_CONFIG_URI to your server`,
          { cause: err },
        );
      }
      throw err;
    }
  })();

  try {

    return await connecting;

  } finally {

    connecting = null;

  }

}



function docId(key, tenantId) {
  const tid = tenantId || resolveConfigTenantId();
  return `${tid}:${key}`;
}

function configTenantId(tenantId) {
  return tenantId || resolveConfigTenantId();
}



async function readDocument(key, tenantId) {
  if (isMemoryMode()) {
    return memoryDocs.get(docId(key, tenantId)) || null;
  }
  const database = await connect();
  return database.collection(CONFIG_COLLECTION).findOne({ _id: docId(key, tenantId) });
}



async function writeDocument(key, data, tenantId) {
  const tid = configTenantId(tenantId);
  if (isMemoryMode()) {
    const id = docId(key, tid);
    const now = new Date();
    memoryDocs.set(id, {
      _id: id,
      tenantId: tid,
      key,
      data,
      updatedAt: now,
      createdAt: memoryDocs.get(id)?.createdAt || now,
    });
    return;
  }
  const database = await connect();
  const now = new Date();
  await database.collection(CONFIG_COLLECTION).updateOne(
    { _id: docId(key, tid) },
    {
      $set: {
        tenantId: tid,
        key,
        data,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}



async function loadAllDocuments(keys, tenantId) {
  if (isMemoryMode()) {
    const out = new Map();
    for (const key of keys) {
      const row = memoryDocs.get(docId(key, tenantId));
      if (row?.key) out.set(row.key, row.data);
    }
    return out;
  }
  const database = await connect();
  const ids = keys.map((k) => docId(k, tenantId));
  const rows = await database.collection(CONFIG_COLLECTION).find({ _id: { $in: ids } }).toArray();
  const out = new Map();
  for (const row of rows) {
    if (row?.key) out.set(row.key, row.data);
  }
  return out;
}



async function listProjectSnapshots() {

  if (isMemoryMode()) {

    return [...memoryProjects.values()]

      .filter((r) => r.tenantId === configTenantId())

      .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))

      .map((r) => ({

        id: r.projectId,

        name: r.name || r.projectId,

        savedAt: r.savedAt || null,

        tagCount: r.tagCount ?? null,

        driverCount: r.driverCount ?? null,

      }));

  }

  const database = await connect();

  const rows = await database.collection(CONFIG_PROJECTS_COLLECTION)

    .find({ tenantId: configTenantId() })

    .project({ projectId: 1, name: 1, savedAt: 1, tagCount: 1, driverCount: 1 })

    .sort({ savedAt: -1 })

    .toArray();

  return rows.map((r) => ({

    id: r.projectId,

    name: r.name || r.projectId,

    savedAt: r.savedAt ? new Date(r.savedAt).toISOString() : null,

    tagCount: r.tagCount ?? null,

    driverCount: r.driverCount ?? null,

  }));

}



async function readProjectSnapshot(projectId) {

  if (isMemoryMode()) {

    return memoryProjects.get(`${configTenantId()}:${projectId}`) || null;

  }

  const database = await connect();

  return database.collection(CONFIG_PROJECTS_COLLECTION).findOne({

    tenantId: configTenantId(),

    projectId,

  });

}



async function writeProjectSnapshot(projectId, doc, meta = {}) {

  const savedAt = new Date().toISOString();

  const out = { ...doc, savedAt };

  if (isMemoryMode()) {

    const id = `${configTenantId()}:${projectId}`;

    memoryProjects.set(id, {

      tenantId: configTenantId(),

      projectId,

      name: meta.name || doc?.project?.name || projectId,

      savedAt,

      tagCount: Array.isArray(doc?.tags) ? doc.tags.length : null,

      driverCount: Array.isArray(doc?.drivers) ? doc.drivers.length : null,

      data: out,

      updatedAt: new Date(),

      createdAt: memoryProjects.get(id)?.createdAt || new Date(),

    });

    return { id: projectId, savedAt };

  }

  const database = await connect();

  await database.collection(CONFIG_PROJECTS_COLLECTION).updateOne(

    { tenantId: configTenantId(), projectId },

    {

      $set: {

        tenantId: configTenantId(),

        projectId,

        name: meta.name || doc?.project?.name || projectId,

        savedAt,

        tagCount: Array.isArray(doc?.tags) ? doc.tags.length : null,

        driverCount: Array.isArray(doc?.drivers) ? doc.drivers.length : null,

        data: out,

        updatedAt: new Date(),

      },

      $setOnInsert: { createdAt: new Date() },

    },

    { upsert: true },

  );

  return { id: projectId, savedAt };

}



async function deleteProjectSnapshot(projectId) {

  if (isMemoryMode()) {

    return memoryProjects.delete(`${configTenantId()}:${projectId}`);

  }

  const database = await connect();

  const r = await database.collection(CONFIG_PROJECTS_COLLECTION).deleteOne({

    tenantId: configTenantId(),

    projectId,

  });

  return r.deletedCount > 0;

}



async function close() {

  if (isMemoryMode()) {

    resetMemory();

    return;

  }

  if (client) {

    await client.close();

    client = null;

    db = null;

  }

}



function status() {

  return {

    connected: isMemoryMode() ? true : !!db,

    uri: isMemoryMode() ? 'memory' : (uri() ? '(configured)' : ''),

    db: CONFIG_DB,

    collection: CONFIG_COLLECTION,

    projectsCollection: CONFIG_PROJECTS_COLLECTION,

    tenantId: configTenantId(),

  };

}



module.exports = {

  connect,

  readDocument,

  writeDocument,

  loadAllDocuments,

  listProjectSnapshots,

  readProjectSnapshot,

  writeProjectSnapshot,

  deleteProjectSnapshot,

  close,

  status,

  resetMemory,

  isMemoryMode,

};



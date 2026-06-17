'use strict';

const { connectMongo } = require('./mongo');

const COLLECTIONS = ['tenants', 'users', 'locations', 'systems', 'devices'];

/**
 * Ensure compound indexes for tenant isolation and hierarchy uniqueness.
 * @param {import('mongodb').Db} [db]
 */
async function ensureIndexes(db) {
  const database = db || await connectMongo();

  await database.collection('tenants').createIndex({ slug: 1 }, { unique: true });

  await database.collection('users').createIndex(
    { tenantId: 1, email: 1 },
    { unique: true },
  );
  await database.collection('users').createIndex({ tenantId: 1 });
  await database.collection('users').createIndex({ email: 1 });

  await database.collection('locations').createIndex(
    { tenantId: 1, slug: 1 },
    { unique: true },
  );
  await database.collection('locations').createIndex({ tenantId: 1 });

  await database.collection('systems').createIndex(
    { locationId: 1, slug: 1 },
    { unique: true },
  );
  await database.collection('systems').createIndex({ tenantId: 1, locationId: 1 });

  await database.collection('devices').createIndex(
    { systemId: 1, slug: 1 },
    { unique: true },
  );
  await database.collection('devices').createIndex({ tenantId: 1, systemId: 1 });

  return { collections: COLLECTIONS };
}

if (require.main === module) {
  ensureIndexes()
    .then(() => {
      console.log('[indexes] ensured for', COLLECTIONS.join(', '));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[indexes] failed:', err.message);
      process.exit(1);
    });
}

module.exports = { ensureIndexes, COLLECTIONS };

'use strict';

const { connectMongo } = require('./mongo');
const { DEFAULT_TTL_DAYS, ttlSeconds } = require('../ingest/slimTelemetry');

const COLLECTIONS = ['tenants', 'users', 'locations', 'systems', 'devices'];
const CMMS_COLLECTIONS = ['cmms_facilities', 'cmms_assets', 'cmms_workorders'];

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

  for (const name of CMMS_COLLECTIONS) {
    await database.collection(name).createIndex({ tenantId: 1 });
  }

  await database.collection('alarm_notify_queue').createIndex({ tenantId: 1, at: -1 });
  await database.collection('password_reset_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection('password_reset_tokens').createIndex({ tenantId: 1, userId: 1 });
  await database.collection('cmms_alarm_events').createIndex({ tenantId: 1, publishedAt: -1 });

  await database.collection('device_telemetry_latest').createIndex(
    { tenantId: 1, deviceId: 1 },
    { unique: true },
  );
  await database.collection('device_telemetry').createIndex(
    { ingestedAt: 1 },
    { expireAfterSeconds: ttlSeconds(DEFAULT_TTL_DAYS) },
  );
  await database.collection('device_telemetry').createIndex({ tenantId: 1, deviceId: 1, ingestedAt: -1 });
  await database.collection('parc_devices').createIndex(
    { tenantId: 1, deviceId: 1 },
    { unique: true },
  );
  await database.collection('parc_devices').createIndex({ tenantId: 1, lastSeenAt: -1 });

  await database.collection('project_repository').createIndex(
    { tenantId: 1, locationId: 1, slug: 1 },
    { unique: true },
  );
  await database.collection('project_repository').createIndex({ tenantId: 1, locationId: 1, updatedAt: -1 });
  await database.collection('project_repository').createIndex({ tenantId: 1, updatedAt: -1 });

  await database.collection('connectivity_billing').createIndex(
    { tenantId: 1, systemId: 1 },
    { unique: true },
  );
  await database.collection('connectivity_billing').createIndex({ tenantId: 1, renewalAt: 1 });
  await database.collection('connectivity_billing').createIndex({ tenantId: 1, status: 1 });
  await database.collection('connectivity_billing').createIndex({ deviceId: 1 });
  await database.collection('connectivity_billing').createIndex({ renewalAt: 1, status: 1, autoRenew: 1 });

  await database.collection('install_manifests').createIndex({ deviceId: 1, status: 1 });
  await database.collection('install_manifests').createIndex({ status: 1, manufacturedAt: -1 });
  await database.collection('install_manifests').createIndex({ claimedTenantId: 1, claimedAt: -1 });

  return {
    collections: [
      ...COLLECTIONS,
      ...CMMS_COLLECTIONS,
      'alarm_notify_queue',
      'password_reset_tokens',
      'cmms_alarm_events',
      'device_telemetry_latest',
      'device_telemetry',
      'parc_devices',
      'connectivity_billing',
      'install_manifests',
    ],
  };
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

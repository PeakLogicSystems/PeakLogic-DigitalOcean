'use strict';

/**
 * Wipe bulky telemetry / camera event collections and (re)create MongoDB
 * time-series plant_sensor_data for compressed DAQ.
 *
 * KEEPS: tenants, users, locations, systems, devices, password tokens, config.
 * DROPS: tag_logs, device_telemetry, device_telemetry*, camera_events,
 *        alarm_notify_queue (optional), plant_sensor_data (recreated as TS)
 *
 * Usage (droplet):
 *   WIPE_TELEMETRY=1 sudo -u peaklogic bash -lc 'cd /home/peaklogic && node scripts/wipe-telemetry-enable-timeseries.js'
 */

const { connectMongo, closeMongo, getDb } = require('../src/db/mongo');
const sensorTs = require('../src/ingest/sensorTimeSeries');

const DROP = [
  'tag_logs',
  'device_telemetry',
  'device_telemetry_history',
  'camera_events',
  'alarm_notify_queue',
  'plant_sensor_data', // recreate as time-series
];

// Optional fat online/history tables (set WIPE_ONLINE_CACHE=1 to drop too)
if (process.env.WIPE_ONLINE_CACHE === '1') {
  DROP.push('device_telemetry_latest', 'parc_devices');
}

async function main() {
  if (process.env.WIPE_TELEMETRY !== '1') {
    console.error('Refusing to wipe — set WIPE_TELEMETRY=1 to confirm.');
    process.exit(2);
  }

  await connectMongo();
  const db = getDb();
  console.log(`[wipe] database=${db.databaseName}`);

  for (const name of DROP) {
    try {
      const r = await db.collection(name).drop();
      console.log(`[wipe] dropped ${name}:`, r);
    } catch (e) {
      if (e.codeName === 'NamespaceNotFound' || /not found/i.test(e.message || '')) {
        console.log(`[wipe] skip missing ${name}`);
      } else {
        console.warn(`[wipe] ${name}:`, e.message || e);
      }
    }
  }

  // Optional GridFS camera snapshot buckets
  for (const prefix of ['camera_snapshots.files', 'camera_snapshots.chunks']) {
    try {
      await db.collection(prefix).drop();
      console.log(`[wipe] dropped ${prefix}`);
    } catch (e) {
      if (e.codeName !== 'NamespaceNotFound' && !/not found/i.test(e.message || '')) {
        console.warn(`[wipe] ${prefix}:`, e.message || e);
      }
    }
  }

  const init = await sensorTs.init();
  console.log('[wipe] time-series init:', init);
  const stats = await sensorTs.getCollectionStats();
  console.log('[wipe] ts stats:', stats);
  console.log('[wipe] done — tenants/locations/users preserved. Restart peaklogic-saas.');
  await closeMongo();
}

main().catch(async (err) => {
  console.error('[wipe] failed:', err);
  try { await closeMongo(); } catch { /* ignore */ }
  process.exit(1);
});

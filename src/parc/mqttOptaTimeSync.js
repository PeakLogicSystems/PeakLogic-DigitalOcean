'use strict';

const { buildSyncTimeBody } = require('../drivers/optaProtocol');
const { registry } = require('./deviceRegistry');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REMOTE_OPTA_TYPES = new Set(['mqtt_parc', 'opta_remote']);

let dailyTimer = null;

function listLiveRemoteOptaConfigs(driverManager) {
  return (driverManager?.configs || [])
    .filter((c) => REMOTE_OPTA_TYPES.has(c.type) && c.enabled !== false)
    .filter((c) => {
      const deviceId = String(c.deviceId || c.id || '').trim();
      const dev = deviceId ? registry.getDevice(deviceId) : null;
      return dev && !dev.stale;
    });
}

/**
 * Sync wall clock on all live Opta devices (deduped by deviceId).
 * @returns {Promise<{ synced: number, deviceIds: string[] }>}
 */
async function syncOptaClocks(driverManager) {
  const { ensureMqttHubConnected } = require('./mqttParcBootstrap');
  const hubReady = await ensureMqttHubConnected({ persist: false });
  if (!hubReady.connected) {
    return { synced: 0, deviceIds: [], skipped: hubReady.error || 'hub offline' };
  }

  const syncedIds = [];
  const seen = new Set();
  for (const cfg of listLiveRemoteOptaConfigs(driverManager)) {
    const deviceId = String(cfg.deviceId || cfg.id || '').trim();
    if (!deviceId || seen.has(deviceId)) continue;
    const inst = driverManager.instances.get(cfg.id);
    if (!inst?.syncTime) continue;
    seen.add(deviceId);
    try {
      await inst.syncTime({ deviceId });
      syncedIds.push(deviceId);
    } catch (e) {
      console.warn(`[mqtt-parc] daily sync_time failed for ${deviceId}: ${e.message || e}`);
    }
  }
  if (syncedIds.length) {
    console.log(`[mqtt-parc] daily sync_time → ${syncedIds.join(', ')}`);
  }
  return { synced: syncedIds.length, deviceIds: syncedIds };
}

function startOptaDailyTimeSync(driverManager) {
  if (dailyTimer) clearInterval(dailyTimer);
  dailyTimer = setInterval(() => {
    syncOptaClocks(driverManager).catch((e) => {
      console.warn('[mqtt-parc] daily sync_time:', e.message || e);
    });
  }, MS_PER_DAY);
  if (dailyTimer.unref) dailyTimer.unref();
}

module.exports = {
  buildSyncTimeBody,
  syncOptaClocks,
  startOptaDailyTimeSync,
  listLiveRemoteOptaConfigs,
};

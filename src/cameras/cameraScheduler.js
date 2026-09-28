'use strict';

const { registry } = require('./cameraRegistry');
const { captureAndStore, purgeRetention } = require('./cameraSnapshotService');
const { logEvent } = require('./cameraEvents');

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const settings = registry.settings();
    if (!settings.snapshotArchiveEnabled) return;

    for (const rec of registry.listCameraRecords()) {
      if (rec.probeStatus !== 'ok' || !rec.snapshotUrl) continue;
      try {
        await captureAndStore(rec.cameraId, { reason: 'scheduled' });
      } catch (e) {
        await logEvent({
          cameraId: rec.cameraId,
          type: 'error',
          message: `Scheduled snapshot failed: ${e.message || String(e)}`,
        }).catch(() => {});
      }
    }

    await purgeRetention(settings);
  } finally {
    running = false;
  }
}

function start() {
  stop();
  const settings = registry.settings();
  if (!settings.snapshotArchiveEnabled) return { started: false };
  const intervalMs = Math.max(15000, Number(settings.snapshotIntervalMs) || 60000);
  timer = setInterval(() => {
    tick().catch((e) => console.warn('[camera-scheduler]', e.message || e));
  }, intervalMs);
  tick().catch(() => {});
  console.log(`[camera-scheduler] snapshot archive every ${intervalMs}ms`);
  return { started: true, intervalMs };
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  return { stopped: true };
}

function status() {
  const settings = registry.settings();
  return {
    running: !!timer,
    archiveEnabled: !!settings.snapshotArchiveEnabled,
    intervalMs: Number(settings.snapshotIntervalMs) || 60000,
    retentionDays: Number(settings.snapshotRetentionDays) || 30,
  };
}

module.exports = {
  start,
  stop,
  tick,
  status,
};

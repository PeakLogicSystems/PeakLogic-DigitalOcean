'use strict';

const { registry } = require('./cameraRegistry');
const { inferOnMotion, aiEnabled } = require('./cameraInference');
const { createPullPointSubscription, pullMessages } = require('./onvifEvents');
const { logEvent } = require('./cameraEvents');

const monitors = new Map();

function cameraCreds(rec, settings) {
  return {
    username: rec.username || settings.defaultUsername || '',
    password: rec.password || settings.defaultPassword || '',
    timeoutMs: 15000,
  };
}

function eventsUrlFor(rec) {
  return rec.eventsUrl || rec.mediaUrl?.replace(/\/media_service.*/i, '/events_service')
    || rec.onvifUrl?.replace(/device_service/i, 'events_service')
    || '';
}

async function monitorLoop(cameraId, state) {
  const settings = registry.settings();
  while (monitors.get(cameraId) === state) {
    if (!aiEnabled(settings) || settings.cameraAiMotionEnabled === false) {
      await sleep(5000);
      continue;
    }
    const rec = registry.getCameraRecord(cameraId);
    if (!rec || rec.probeStatus !== 'ok') {
      await sleep(10000);
      continue;
    }
    const eventsUrl = eventsUrlFor(rec);
    if (!eventsUrl) {
      await sleep(30000);
      continue;
    }
    const creds = cameraCreds(rec, settings);
    try {
      if (!state.pullUrl) {
        const sub = await createPullPointSubscription(eventsUrl, creds);
        state.pullUrl = sub.pullUrl;
        await logEvent({
          cameraId,
          type: 'motion_monitor',
          message: 'ONVIF pull point subscription started',
        }).catch(() => {});
      }
      const notes = await pullMessages(state.pullUrl, creds, { timeoutSec: 8, limit: 10 });
      for (const note of notes) {
        if (!note.isMotion) continue;
        const now = Date.now();
        if (now - state.lastMotionAt < (Number(settings.cameraAiMotionCooldownMs) || 10000)) {
          continue;
        }
        state.lastMotionAt = now;
        await logEvent({
          cameraId,
          type: 'motion',
          message: `ONVIF motion: ${note.topic || 'detected'}`,
        }).catch(() => {});
        inferOnMotion(cameraId).catch((e) => {
          console.warn(`[camera-motion] ${cameraId}:`, e.message || e);
        });
      }
    } catch (e) {
      state.pullUrl = null;
      await logEvent({
        cameraId,
        type: 'error',
        message: `Motion monitor error: ${e.message || String(e)}`,
      }).catch(() => {});
      await sleep(15000);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function startCamera(cameraId) {
  if (monitors.has(cameraId)) return;
  const state = { pullUrl: null, lastMotionAt: 0 };
  monitors.set(cameraId, state);
  monitorLoop(cameraId, state).catch((e) => {
    console.warn(`[camera-motion] loop ${cameraId}:`, e.message || e);
  });
}

function stopCamera(cameraId) {
  monitors.delete(cameraId);
}

function start() {
  stop();
  const settings = registry.settings();
  if (!aiEnabled(settings) || settings.cameraAiMotionEnabled === false) {
    return { started: false, cameras: 0 };
  }
  let count = 0;
  for (const rec of registry.listCameraRecords()) {
    if (rec.probeStatus !== 'ok') continue;
    startCamera(rec.cameraId);
    count += 1;
  }
  console.log(`[camera-motion] ONVIF motion monitors for ${count} camera(s)`);
  return { started: true, cameras: count };
}

function stop() {
  for (const id of [...monitors.keys()]) stopCamera(id);
  return { stopped: true };
}

function status() {
  const settings = registry.settings();
  return {
    enabled: aiEnabled(settings) && settings.cameraAiMotionEnabled !== false,
    activeMonitors: monitors.size,
    cooldownMs: Number(settings.cameraAiMotionCooldownMs) || 10000,
  };
}

function refresh() {
  stop();
  return start();
}

module.exports = {
  start,
  stop,
  refresh,
  status,
  startCamera,
  stopCamera,
};

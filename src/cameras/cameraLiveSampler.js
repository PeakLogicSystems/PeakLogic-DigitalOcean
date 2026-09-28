'use strict';

const { registry } = require('./cameraRegistry');
const { inferLiveCamera, aiEnabled } = require('./cameraInference');
const go2rtc = require('./go2rtcManager');
const { checkRtspReachability } = require('./cameraReachability');

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const settings = registry.settings();
    if (!aiEnabled(settings) || settings.cameraAiLiveEnabled === false) return;
    if (!settings.go2rtcEnabled) return;

    await go2rtc.ensureRunning(settings).catch(() => {});

    for (const rec of registry.listCameraRecords()) {
      if (rec.probeStatus !== 'ok' || !rec.rtspUrl) continue;
      const reach = await checkRtspReachability(rec.rtspUrl, rec, settings);
      if (!reach.ok) continue;
      try {
        await inferLiveCamera(rec.cameraId);
      } catch {
        // per-camera errors are non-fatal
      }
    }
  } finally {
    running = false;
  }
}

function start() {
  stop();
  const settings = registry.settings();
  if (!aiEnabled(settings) || settings.cameraAiLiveEnabled === false) {
    return { started: false };
  }
  const intervalMs = Math.max(2000, Number(settings.cameraAiLiveIntervalMs) || 5000);
  timer = setInterval(() => {
    tick().catch((e) => console.warn('[camera-live-ai]', e.message || e));
  }, intervalMs);
  console.log(`[camera-live-ai] sampling go2rtc frames every ${intervalMs}ms`);
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
    enabled: aiEnabled(settings) && settings.cameraAiLiveEnabled !== false,
    intervalMs: Number(settings.cameraAiLiveIntervalMs) || 5000,
  };
}

module.exports = { start, stop, tick, status };

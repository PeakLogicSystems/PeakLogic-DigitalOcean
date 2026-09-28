'use strict';

const go2rtc = require('./go2rtcManager');
const cameraScheduler = require('./cameraScheduler');
const cameraLiveSampler = require('./cameraLiveSampler');
const cameraMotionMonitor = require('./cameraMotionMonitor');
const cameraTagBridge = require('./cameraTagBridge');
const cameraInference = require('./cameraInference');
const { registry } = require('./cameraRegistry');

function restartCameraAiServices(settings) {
  if (settings.cameraAiLiveEnabled !== false && cameraInference.aiEnabled(settings)) {
    cameraLiveSampler.start();
  } else {
    cameraLiveSampler.stop();
  }
  if (settings.cameraAiMotionEnabled !== false && cameraInference.aiEnabled(settings)) {
    cameraMotionMonitor.refresh();
  } else {
    cameraMotionMonitor.stop();
  }
}

async function stopCameraSystem() {
  cameraScheduler.stop();
  cameraLiveSampler.stop();
  cameraMotionMonitor.stop();
  cameraTagBridge.stop();
  await go2rtc.stop().catch(() => {});
}

async function startCameraSystem(settings = registry.settings()) {
  if (settings.go2rtcEnabled !== false) {
    await go2rtc.start(settings).catch(() => {});
    await go2rtc.syncAllFromRegistry(registry, settings).catch(() => {});
  }
  if (settings.snapshotArchiveEnabled) cameraScheduler.start();
  if (settings.cameraAiEnabled !== false) restartCameraAiServices(settings);
  if (settings.cameraTagBridgeEnabled !== false) cameraTagBridge.start();
}

module.exports = {
  stopCameraSystem,
  startCameraSystem,
  restartCameraAiServices,
};

'use strict';

const path = require('path');
const persistence = require('../src/persistence');
const { registry } = require('../src/cameras/cameraRegistry');
const go2rtc = require('../src/cameras/go2rtcManager');

const DATA_DIR = process.env.PEAKLOGIC_DATA || path.join(__dirname, '..', 'data');

async function main() {
  persistence.ensureDataDir();
  const settings = registry.settings();
  if (settings.camerasEnabled === false) {
    console.log('Camera system is disabled in settings (Cameras → Administration… → Settings).');
    process.exit(0);
  }
  if (!settings.go2rtcEnabled) {
    console.log('go2rtc is disabled in camera settings (Cameras → Administration… → Settings).');
    process.exit(0);
  }
  const result = await go2rtc.start(settings);
  if (result.alreadyRunning) {
    console.log(`go2rtc already running on 127.0.0.1:${result.port}`);
  }
  const sync = await go2rtc.syncAllFromRegistry(registry, settings);
  const ok = sync.synced.filter((s) => s.ok).length;
  const skipped = sync.skipped?.length || 0;
  const parts = [`Synced ${ok}/${sync.synced.length} camera stream(s) to go2rtc.`];
  if (skipped) parts.push(`Skipped ${skipped} unreachable.`);
  console.log(parts.join(' '));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

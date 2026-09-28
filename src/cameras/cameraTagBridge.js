'use strict';

const { registry } = require('./cameraRegistry');
const { collectSnapshotTriggers } = require('./cameraOverlays');
const { getTagStore } = require('./cameraAiHolder');
const snapshotService = require('./cameraSnapshotService');
const { logEvent } = require('./cameraEvents');

let timer = null;
const lastBool = new Map();

function tagBoolValue(tagStore, tagId) {
  if (!tagStore?.get) return null;
  const tag = tagStore.get(tagId);
  if (!tag) return null;
  const v = tag.value != null ? tag.value : tag.val;
  if (tag.type === 'BOOL') return !!v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return !!v;
}

async function checkTriggers() {
  const settings = registry.settings();
  if (settings.cameraTagBridgeEnabled === false) return;
  const tagStore = getTagStore();
  if (!tagStore) return;

  const triggers = collectSnapshotTriggers(registry.listCameraRecords());
  for (const tr of triggers) {
    const key = `${tr.cameraId}:${tr.tagId}`;
    const cur = tagBoolValue(tagStore, tr.tagId);
    if (cur == null) continue;
    const prev = lastBool.has(key) ? lastBool.get(key) : cur;
    lastBool.set(key, cur);

    const rising = tr.snapshotOnRising && !prev && cur;
    const falling = tr.snapshotOnFalling && prev && !cur;
    if (!rising && !falling) continue;

    const edge = rising ? 'rising' : 'falling';
    try {
      await snapshotService.captureAndStore(tr.cameraId, {
        reason: `tag_${edge}`,
        tagId: tr.tagId,
        meta: { overlayId: tr.overlayId, edge },
      });
      await logEvent({
        cameraId: tr.cameraId,
        type: 'tag_snapshot',
        message: `Snapshot on ${edge} edge of ${tr.tagId}`,
        meta: { tagId: tr.tagId, overlayId: tr.overlayId, edge },
      });
    } catch (e) {
      await logEvent({
        cameraId: tr.cameraId,
        type: 'error',
        message: `Tag-edge snapshot failed: ${e.message || String(e)}`,
        meta: { tagId: tr.tagId, edge },
      }).catch(() => {});
    }
  }
}

function start() {
  stop();
  const settings = registry.settings();
  if (settings.cameraTagBridgeEnabled === false) return { started: false };
  const intervalMs = Math.max(200, Number(settings.cameraTagBridgeIntervalMs) || 500);
  timer = setInterval(() => {
    checkTriggers().catch((e) => console.warn('[camera-tag-bridge]', e.message || e));
  }, intervalMs);
  console.log(`[camera-tag-bridge] watching overlay tag edges every ${intervalMs}ms`);
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
    enabled: settings.cameraTagBridgeEnabled !== false,
    intervalMs: Number(settings.cameraTagBridgeIntervalMs) || 500,
    watchedTags: collectSnapshotTriggers(registry.listCameraRecords()).length,
  };
}

function resetState() {
  lastBool.clear();
}

module.exports = {
  start,
  stop,
  status,
  checkTriggers,
  resetState,
};

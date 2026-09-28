'use strict';

const pdmService = require('./pdmService');
const persistence = require('../persistence');
const { normalizePdmSettings } = require('../settings/pdmSettings');

let timer = null;
let lastRunAt = null;
let lastRunError = null;
let running = false;

async function runBatch(getSettings) {
  if (running) return { ok: false, error: 'Batch already running' };
  running = true;
  lastRunError = null;
  try {
    const settings = typeof getSettings === 'function' ? getSettings() : persistence.readJson('settings.json', {});
    const result = await pdmService.buildAllFeatures({ settings });
    lastRunAt = new Date().toISOString();
    return { ok: true, ...result, ranAt: lastRunAt };
  } catch (e) {
    lastRunError = e.message || String(e);
    return { ok: false, error: lastRunError };
  } finally {
    running = false;
  }
}

function scheduleNext(getSettings) {
  if (timer) clearTimeout(timer);
  timer = null;
  const settings = typeof getSettings === 'function' ? getSettings() : persistence.readJson('settings.json', {});
  const pdm = normalizePdmSettings(settings.pdm, settings);
  if (!pdm.buildEnabled) return;
  const intervalMs = Math.max(1, Number(pdm.buildIntervalHours) || 24) * 60 * 60 * 1000;
  timer = setTimeout(async () => {
    await runBatch(getSettings);
    scheduleNext(getSettings);
  }, intervalMs);
}

function startPdmBatchScheduler(getSettings) {
  scheduleNext(getSettings);
  return {
    runNow: () => runBatch(getSettings),
    status: () => ({
      scheduled: !!timer,
      running,
      lastRunAt,
      lastRunError,
      ...pdmService.batchStatus(typeof getSettings === 'function' ? getSettings() : persistence.readJson('settings.json', {})),
    }),
    stop: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

module.exports = {
  startPdmBatchScheduler,
  runBatch,
};

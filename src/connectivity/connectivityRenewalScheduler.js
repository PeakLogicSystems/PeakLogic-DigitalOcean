'use strict';

const billingService = require('./connectivityBillingService');
const { readConnectivityBillingSettings } = require('./connectivityBillingSettings');

let timer = null;
let lastRunAt = null;
let lastRunError = null;
let running = false;

async function runRenewals(opts = {}) {
  if (running) return { ok: false, error: 'Renewal job already running' };
  running = true;
  lastRunError = null;
  try {
    const result = await billingService.processDueRenewals(opts);
    lastRunAt = new Date().toISOString();
    return { ok: true, ...result, ranAt: lastRunAt };
  } catch (e) {
    lastRunError = e.message || String(e);
    return { ok: false, error: lastRunError };
  } finally {
    running = false;
  }
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = null;
  const cfg = readConnectivityBillingSettings();
  if (!cfg.enabled) return;
  const intervalMs = Math.max(1, Number(cfg.checkIntervalHours) || 24) * 60 * 60 * 1000;
  timer = setTimeout(async () => {
    await runRenewals();
    scheduleNext();
  }, intervalMs);
}

function startConnectivityRenewalScheduler() {
  scheduleNext();
  return {
    runNow: (opts) => runRenewals(opts),
    status: () => ({
      scheduled: !!timer,
      running,
      lastRunAt,
      lastRunError,
      settings: readConnectivityBillingSettings(),
    }),
    stop: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

module.exports = {
  startConnectivityRenewalScheduler,
  runRenewals,
};

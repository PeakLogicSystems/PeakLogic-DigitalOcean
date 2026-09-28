'use strict';

/** Per-driver fieldbus poll throttle (0 = every scan). */

function pollIntervalMs(cfg, defaultMs = 0) {
  const n = Number(cfg?.pollIntervalMs);
  if (!Number.isFinite(n) || n < 0) return defaultMs;
  return Math.floor(n);
}

function shouldSkipFieldbusPoll(driver, cfg) {
  const pollMs = pollIntervalMs(cfg);
  if (pollMs <= 0) return false;
  const now = Date.now();
  if (!driver._lastPollAt) driver._lastPollAt = 0;
  return (now - driver._lastPollAt) < pollMs;
}

function markFieldbusPolled(driver) {
  driver._lastPollAt = Date.now();
}

module.exports = { pollIntervalMs, shouldSkipFieldbusPoll, markFieldbusPolled };

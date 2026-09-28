'use strict';

/** Normal operator HMI / dashboard refresh (1 minute). */
const HMI_POLL_MS_NORMAL = 60_000;

/** Technician test mode — faster live refresh for commissioning. */
const HMI_POLL_MS_TEST = 10_000;

function normalizeUserLevel(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'technician' ? 'technician' : 'operator';
}

function normalizeHmiTestMode(raw, settings) {
  if (raw !== true) return false;
  return canEnableHmiTestMode(settings);
}

/** Test mode is technician-only in production; demo projects may expose the toggle. */
function canEnableHmiTestMode(settings) {
  if (normalizeUserLevel(settings?.userLevel) === 'technician') return true;
  return settings?.demoFeatures?.hmiTestMode === true;
}

function hmiPollMsFromSettings(settings) {
  return normalizeHmiTestMode(settings?.hmi?.testMode, settings)
    ? HMI_POLL_MS_TEST
    : HMI_POLL_MS_NORMAL;
}

module.exports = {
  HMI_POLL_MS_NORMAL,
  HMI_POLL_MS_TEST,
  normalizeUserLevel,
  normalizeHmiTestMode,
  canEnableHmiTestMode,
  hmiPollMsFromSettings,
};

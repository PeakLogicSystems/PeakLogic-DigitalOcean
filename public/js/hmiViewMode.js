'use strict';

window.PeakLogicHmiViewMode = (function () {
  const HMI_POLL_MS_NORMAL = 60_000;
  const HMI_POLL_MS_TEST = 10_000;

  function normalizeUserLevel(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    return v === 'technician' ? 'technician' : 'operator';
  }

  function canEnableHmiTestMode(settings) {
    if (normalizeUserLevel(settings?.userLevel) === 'technician') return true;
    return settings?.demoFeatures?.hmiTestMode === true;
  }

  function isHmiTestMode(settings) {
    return settings?.hmi?.testMode === true && canEnableHmiTestMode(settings);
  }

  function hmiPollMsFromSettings(settings) {
    return isHmiTestMode(settings) ? HMI_POLL_MS_TEST : HMI_POLL_MS_NORMAL;
  }

  return {
    HMI_POLL_MS_NORMAL,
    HMI_POLL_MS_TEST,
    normalizeUserLevel,
    canEnableHmiTestMode,
    isHmiTestMode,
    hmiPollMsFromSettings,
  };
})();

'use strict';

const { normalizeInferenceSettings } = require('./inferenceSettings');
const { normalizePdmSettings } = require('./pdmSettings');
const { normalizeCmmsSettings } = require('./cmmsSettings');

/**
 * Production profile: maximize proactive early warning (edge + host + all PdM forecast paths).
 */
const PRODUCTION_EARLY_WARNING = {
  inference: {
    hostEnabled: true,
    mode: 'host-supplement',
    backend: 'auto',
  },
  pdm: {
    buildEnabled: true,
    buildIntervalHours: 24,
    failureThreshold: 0.35,
    windowMin: 60,
    forecastMethods: ['health_index', 'run_amps_creep', 'start_time_ms'],
    reportEnabled: false,
    reportTitle: 'PdM Report',
  },
  cmms: {
    autoWorkOrdersFromPdm: true,
    autoWorkOrdersFromAlarms: false,
    appendServiceHistoryOnWoComplete: true,
  },
};

function applyProductionEarlyWarningProfile(settings = {}) {
  const inference = normalizeInferenceSettings(
    { ...PRODUCTION_EARLY_WARNING.inference, ...(settings.inference || {}) },
    settings,
  );
  const pdm = normalizePdmSettings(
    { ...PRODUCTION_EARLY_WARNING.pdm, ...(settings.pdm || {}) },
    settings,
  );
  const cmms = normalizeCmmsSettings(
    { ...PRODUCTION_EARLY_WARNING.cmms, ...(settings.cmms || {}) },
    settings,
  );
  return {
    ...settings,
    inference,
    pdm,
    cmms,
    pdmProductionProfile: 'early-warning-v1',
  };
}

module.exports = {
  PRODUCTION_EARLY_WARNING,
  applyProductionEarlyWarningProfile,
};

'use strict';

const DEFAULT_CMMS = {
  autoWorkOrdersFromAlarms: true,
  autoWorkOrdersFromPdm: true,
  appendServiceHistoryOnWoComplete: true,
};

function normalizeCmmsSettings(incoming, prev = {}) {
  const base = prev?.cmms && typeof prev.cmms === 'object' ? prev.cmms : {};
  if (incoming === null) return { ...DEFAULT_CMMS };
  if (incoming === undefined) return { ...DEFAULT_CMMS, ...base };
  if (typeof incoming !== 'object') return { ...DEFAULT_CMMS, ...base };
  return {
    autoWorkOrdersFromAlarms: incoming.autoWorkOrdersFromAlarms != null
      ? !!incoming.autoWorkOrdersFromAlarms
      : base.autoWorkOrdersFromAlarms !== false,
    autoWorkOrdersFromPdm: incoming.autoWorkOrdersFromPdm != null
      ? !!incoming.autoWorkOrdersFromPdm
      : base.autoWorkOrdersFromPdm !== false,
    appendServiceHistoryOnWoComplete: incoming.appendServiceHistoryOnWoComplete != null
      ? !!incoming.appendServiceHistoryOnWoComplete
      : base.appendServiceHistoryOnWoComplete !== false,
  };
}

function readCmmsSettings(settings = {}) {
  return normalizeCmmsSettings(settings.cmms, settings);
}

module.exports = {
  DEFAULT_CMMS,
  normalizeCmmsSettings,
  readCmmsSettings,
};

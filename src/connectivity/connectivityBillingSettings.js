'use strict';

const persistence = require('../persistence');

function normalizeConnectivityBillingSettings(input, prev = {}) {
  const base = {
    enabled: prev.enabled !== false,
    defaultTermMonths: Math.max(1, Number(prev.defaultTermMonths) || 12),
    renewalLeadDays: Math.max(0, Number(prev.renewalLeadDays) || 7),
    autoRenewEnabled: prev.autoRenewEnabled !== false,
    checkIntervalHours: Math.max(1, Number(prev.checkIntervalHours) || 24),
  };
  if (input == null || typeof input !== 'object') return base;
  return {
    enabled: input.enabled !== false && base.enabled,
    defaultTermMonths: Math.max(1, Number(input.defaultTermMonths ?? base.defaultTermMonths) || 12),
    renewalLeadDays: Math.max(0, Number(input.renewalLeadDays ?? base.renewalLeadDays) || 7),
    autoRenewEnabled: input.autoRenewEnabled !== false && base.autoRenewEnabled,
    checkIntervalHours: Math.max(1, Number(input.checkIntervalHours ?? base.checkIntervalHours) || 24),
  };
}

function readConnectivityBillingSettings() {
  const settings = persistence.readJson('settings.json', {});
  return normalizeConnectivityBillingSettings(settings.connectivityBilling, settings.connectivityBilling || {});
}

function writeConnectivityBillingSettings(next) {
  const settings = persistence.readJson('settings.json', {});
  settings.connectivityBilling = normalizeConnectivityBillingSettings(next, settings.connectivityBilling || {});
  persistence.writeJson('settings.json', settings);
  return settings.connectivityBilling;
}

module.exports = {
  normalizeConnectivityBillingSettings,
  readConnectivityBillingSettings,
  writeConnectivityBillingSettings,
};

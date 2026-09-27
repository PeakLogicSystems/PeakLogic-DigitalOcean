'use strict';

const CMMS_PLANS = ['none', 'standard', 'enterprise'];

function defaultCmmsEntitlement() {
  return {
    enabled: false,
    plan: 'none',
    enabledAt: null,
    enabledBy: null,
  };
}

/**
 * Normalize tenant CMMS entitlement from DB or API input.
 * @param {object|null|undefined} input
 * @param {{ enabledAt?: Date, enabledBy?: string|null }} [opts]
 */
function normalizeCmmsEntitlement(input, opts = {}) {
  const base = defaultCmmsEntitlement();
  if (!input || typeof input !== 'object') return base;

  const enabled = input.enabled === true;
  let plan = CMMS_PLANS.includes(input.plan) ? input.plan : base.plan;
  if (enabled && plan === 'none') plan = 'standard';
  if (!enabled) plan = 'none';

  return {
    enabled,
    plan,
    enabledAt: enabled ? (input.enabledAt || opts.enabledAt || new Date()) : null,
    enabledBy: enabled ? (input.enabledBy ?? opts.enabledBy ?? null) : null,
  };
}

function publicCmmsEntitlement(cmms) {
  const normalized = normalizeCmmsEntitlement(cmms);
  return {
    enabled: normalized.enabled,
    plan: normalized.plan,
    enabledAt: normalized.enabledAt,
    enabledBy: normalized.enabledBy,
  };
}

function isCmmsEnabled(cmms) {
  return normalizeCmmsEntitlement(cmms).enabled === true;
}

module.exports = {
  CMMS_PLANS,
  defaultCmmsEntitlement,
  normalizeCmmsEntitlement,
  publicCmmsEntitlement,
  isCmmsEnabled,
};

'use strict';

const TENANT_PLANS = ['standard', 'professional', 'enterprise'];

function normalizeTenantPlan(value, fallback = 'standard') {
  const plan = String(value || '').trim().toLowerCase();
  return TENANT_PLANS.includes(plan) ? plan : fallback;
}

module.exports = {
  TENANT_PLANS,
  normalizeTenantPlan,
};

'use strict';

const { isCloudDeployment } = require('../cloud/agentProtocol');
const { visibleKeysForTenant, deviceMatchesFence, tryParseSiteKey } = require('./commissionFence');

function currentTenantRecord() {
  try {
    const { getProjectTenantId } = require('../project/projectTenantContext');
    const { tenantStore } = require('../tenants/tenantStore');
    const tid = getProjectTenantId();
    if (!tid || !tenantStore?.getTenant) return null;
    return tenantStore.getTenant(tid);
  } catch {
    return null;
  }
}

function currentTenantSiteKey() {
  return tryParseSiteKey(currentTenantRecord()?.globalSiteKey);
}

/** Cloud: only Optas whose telemetry site key matches this org. Appliance: all devices. */
function listVisibleParcDevices(registry, opts = {}) {
  const all = registry?.listDevices?.() || [];
  if (!isCloudDeployment() && !opts.forceCloud) return all;
  const tenant = opts.tenant || currentTenantRecord();
  if (!tenant) return [];
  const keys = visibleKeysForTenant(tenant);
  if (!keys.size) return [];
  return all.filter((summary) => {
    const full = registry.getDevice?.(summary.deviceId) || summary;
    return deviceMatchesFence(full, keys);
  });
}

function listVisibleLiveOptas(registry, opts = {}) {
  return listVisibleParcDevices(registry, opts).filter((d) => {
    if (!d || d.stale) return false;
    return String(d.platform || '').includes('arduino-opta');
  });
}

function tenantCanSeeDevice(registry, deviceId, opts = {}) {
  const id = String(deviceId || '').trim();
  if (!id) return false;
  if (!isCloudDeployment() && !opts.forceCloud) return true;
  const full = registry?.getDevice?.(id);
  if (!full) return false;
  const tenant = opts.tenant || currentTenantRecord();
  if (!tenant) return false;
  return deviceMatchesFence(full, visibleKeysForTenant(tenant));
}

module.exports = {
  currentTenantRecord,
  currentTenantSiteKey,
  listVisibleParcDevices,
  listVisibleLiveOptas,
  tenantCanSeeDevice,
};

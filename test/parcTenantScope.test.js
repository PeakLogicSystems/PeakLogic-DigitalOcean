'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getFleetRegistry } = require('../src/parc/deviceRegistry');
const { deviceGlobalSiteKey } = require('../src/parc/commissionFence');
const {
  listVisibleParcDevices,
  listVisibleLiveOptas,
  tenantCanSeeDevice,
} = require('../src/parc/parcTenantScope');
function ingest(deviceId, siteKey) {
  const fleet = getFleetRegistry();
  fleet.ingestReport({
    deviceId,
    platform: 'arduino-opta-mqtt-st',
    globalSiteKey: siteKey,
    tags: [{ id: 'I1', type: 'BOOL', value: true }],
  });
  return fleet;
}

describe('parcTenantScope (org global site key)', () => {
  it('stores telemetry globalSiteKey on the fleet record', () => {
    const fleet = ingest('mv_fence_telem_01', 16);
    const dev = fleet.getDevice('mv_fence_telem_01');
    assert.equal(deviceGlobalSiteKey(dev), 16);
    assert.equal(dev.globalSiteKey, 16);
  });

  it('cloud lists only Optas whose key matches the org', () => {
    const fleet = ingest('mv_fence_org_a', 16);
    ingest('mv_fence_org_b', 32);
    const visible = listVisibleParcDevices(fleet, {
      forceCloud: true,
      tenant: { globalSiteKey: 16 },
    });
    const ids = visible.map((d) => d.deviceId);
    assert.equal(ids.includes('mv_fence_org_a'), true);
    assert.equal(ids.includes('mv_fence_org_b'), false);
    assert.equal(tenantCanSeeDevice(fleet, 'mv_fence_org_a', {
      forceCloud: true,
      tenant: { globalSiteKey: 16 },
    }), true);
    assert.equal(tenantCanSeeDevice(fleet, 'mv_fence_org_b', {
      forceCloud: true,
      tenant: { globalSiteKey: 16 },
    }), false);
  });

  it('hides unfenced Optas from cloud orgs', () => {
    const fleet = getFleetRegistry();
    fleet.ingestReport({
      deviceId: 'mv_fence_nokey',
      platform: 'arduino-opta-mqtt-st',
      tags: [{ id: 'I1', type: 'BOOL', value: false }],
    });
    const visible = listVisibleLiveOptas(fleet, {
      forceCloud: true,
      tenant: { globalSiteKey: 1 },
    });
    assert.equal(visible.some((d) => d.deviceId === 'mv_fence_nokey'), false);
  });

  it('picks only the matching live Opta when many are online', () => {
    const fleet = ingest('mv_fence_other_live', 99);
    ingest('mv_fence_mine_live', 16);
    const live = listVisibleLiveOptas(fleet, {
      forceCloud: true,
      tenant: { globalSiteKey: 16 },
    });
    const ids = live.map((d) => d.deviceId);
    assert.equal(ids.includes('mv_fence_mine_live'), true);
    assert.equal(ids.includes('mv_fence_other_live'), false);
  });
});

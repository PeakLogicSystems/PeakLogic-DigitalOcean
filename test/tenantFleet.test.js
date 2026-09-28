'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { createTenantFleetRoutes, listCheckedInUnassignedDevices, isAssignableParcDeviceId, enrichControllerDevice, siteControllerSummary, resolveAssignTenantId, takeForeignAssignment, controllerAllowedOnTenant } = require('../src/api/routes/tenantFleet');
const { registry } = require('../src/parc/deviceRegistry');
const { tenantStore } = require('../src/tenants/tenantStore');

function withServer(app, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        const result = await fn(port);
        server.close(() => resolve(result));
      } catch (e) {
        server.close(() => reject(e));
      }
    });
  });
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = text;
        try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
        resolve({ status: res.statusCode, body });
      });
    }).on('error', reject);
  });
}

describe('tenantFleet appliance mount', () => {
  it('does not 404 sibling /api routes when not cloud deployment', async () => {
    const prev = process.env.PEAKLOGIC_DEPLOYMENT;
    delete process.env.PEAKLOGIC_DEPLOYMENT;

    const app = express();
    const api = express.Router();
    api.use(createTenantFleetRoutes());
    api.get('/dashboard', (req, res) => res.json({ ok: true }));
    api.get('/cameras', (req, res) => res.json({ cameras: [] }));
    app.use('/api', api);

    try {
      await withServer(app, async (port) => {
        const dash = await getJson(port, '/api/dashboard');
        assert.equal(dash.status, 200);
        assert.equal(dash.body.ok, true);

        const cams = await getJson(port, '/api/cameras');
        assert.equal(cams.status, 200);
        assert.deepEqual(cams.body.cameras, []);

        // Cloud-only fleet path should fall through (no handler → Express 404),
        // not return the old catch-all {"error":"Not found"} from this router.
        const fleet = await getJson(port, '/api/fleet');
        assert.equal(fleet.status, 404);
        assert.notEqual(fleet.body?.error, 'Not found');
      });
    } finally {
      if (prev === undefined) delete process.env.PEAKLOGIC_DEPLOYMENT;
      else process.env.PEAKLOGIC_DEPLOYMENT = prev;
    }
  });
});

describe('listCheckedInUnassignedDevices', () => {
  const TEST_DEVICE = `opta_ut_checkin_${Date.now()}`;
  let tenantId;

  it('filters noise and stale registry ids', () => {
    assert.equal(isAssignableParcDeviceId('test_ping'), false);
    assert.equal(isAssignableParcDeviceId('sim_opta_01'), false);
    assert.equal(isAssignableParcDeviceId('opta_field_01'), true);
    assert.equal(isAssignableParcDeviceId('mv_test_hand_skip_start'), false);
    assert.equal(isAssignableParcDeviceId('opta_wait_test'), false);
    assert.equal(isAssignableParcDeviceId('mv_f2e689fd60d96bab'), true);
  });

  it('cloud checked-in list accepts only ATECC-based field device ids', () => {
    const prev = process.env.PEAKLOGIC_DEPLOYMENT;
    process.env.PEAKLOGIC_DEPLOYMENT = 'cloud';
    try {
      assert.equal(isAssignableParcDeviceId('opta_field_01'), false);
      assert.equal(isAssignableParcDeviceId('mv_f2e689fd60d96bab'), true);
      assert.equal(isAssignableParcDeviceId('opta_0123b636f1c23964ee'), true);
    } finally {
      if (prev === undefined) delete process.env.PEAKLOGIC_DEPLOYMENT;
      else process.env.PEAKLOGIC_DEPLOYMENT = prev;
    }
  });

  it('lists fresh parc devices not yet assigned to a site', () => {
    registry.ingestReport({
      deviceId: TEST_DEVICE,
      name: 'Unit Test Opta',
      platform: 'arduino-opta-mqtt-st',
      tags: [{ id: 'DI1', type: 'BOOL' }],
      meta: { ateccSerial: 'AABBCCDDEE' },
    });
    const listed = listCheckedInUnassignedDevices();
    assert.ok(listed.some((d) => d.deviceId === TEST_DEVICE));
    const row = listed.find((d) => d.deviceId === TEST_DEVICE);
    assert.equal(row.source, 'parc_registry');
    assert.equal(row.stale, false);
    assert.equal(row.pendingTelemetry, false);
  });

  it('lists MQTT-online-only devices awaiting first telemetry', () => {
    const onlineOnlyId = `mv_ut_online_${Date.now()}`;
    registry.ingestReport({
      deviceId: onlineOnlyId,
      name: onlineOnlyId,
      platform: 'arduino-opta-mqtt-st',
      tags: [],
      meta: { online: true, pendingTelemetry: true },
    });
    const listed = listCheckedInUnassignedDevices();
    const row = listed.find((d) => d.deviceId === onlineOnlyId);
    assert.ok(row, 'online-only device should appear for assignment');
    assert.equal(row.pendingTelemetry, true);
  });

  it('includes stale registry rows until a fresh telemetry check-in', () => {
    const staleId = `opta_ut_stale_${Date.now()}`;
    registry.ingestReport({
      deviceId: staleId,
      name: 'Stale Opta',
      platform: 'arduino-opta-mqtt-st',
      tags: [],
    });
    const rec = registry.getDevice(staleId);
    registry.ingestReport({
      deviceId: staleId,
      name: rec.name,
      platform: rec.platform,
      tags: rec.tags || [],
      meta: { ...(rec.meta || {}), _backdate: true },
    });
    // Force stale by backdating lastReportAt in store (simulate old check-in).
    registry._store.devices[staleId].lastReportAt = new Date(Date.now() - 86400000).toISOString();
    const listed = listCheckedInUnassignedDevices();
    const row = listed.find((d) => d.deviceId === staleId);
    assert.ok(row, 'stale unassigned device should still be listed');
    assert.equal(row.stale, true);
  });

  it('hides devices after they are assigned to a site', () => {
    tenantId = tenantStore.createTenant({ tenantSlug: `ut_${Date.now()}`, name: 'UT' }).tenantId;
    tenantStore.upsertDevice(tenantId, {
      deviceId: TEST_DEVICE,
      siteId: 'plant_ut',
      name: 'Unit Test Opta',
    });
    const listed = listCheckedInUnassignedDevices();
    assert.equal(listed.some((d) => d.deviceId === TEST_DEVICE), false);
  });

  it('returns device to checked-in list after unassign', () => {
    tenantStore.unassignDevice(tenantId, TEST_DEVICE);
    assert.equal(tenantStore.findAssignedDevice(TEST_DEVICE), null);
    const rec = tenantStore.getDevice(tenantId, TEST_DEVICE);
    assert.equal(rec.siteId, '');
    registry.ingestReport({
      deviceId: TEST_DEVICE,
      name: 'Unit Test Opta',
      platform: 'arduino-opta-mqtt-st',
      tags: [{ id: 'DI1', type: 'BOOL' }],
    });
    const listed = listCheckedInUnassignedDevices();
    assert.ok(listed.some((d) => d.deviceId === TEST_DEVICE));
  });
});

describe('controller online enrichment', () => {
  it('merges live parc online into assigned controller rows', () => {
    const deviceId = `opta_ut_live_${Date.now()}`;
    registry.ingestReport({
      deviceId,
      name: 'Live Opta',
      platform: 'arduino-opta-mqtt-st',
      tags: [],
    });
    const enriched = enrichControllerDevice({
      deviceId,
      kind: 'controller',
      siteId: 'plant_a',
      online: false,
      commissioning: 'commissioned',
    });
    assert.equal(enriched.online, true);
    assert.equal(enriched.stale, false);
  });

  it('summarizes controller count and online per site', () => {
    const tenantId = tenantStore.createTenant({ tenantSlug: `ut_ctrl_${Date.now()}`, name: 'UT Ctrl' }).tenantId;
    const deviceId = `opta_ut_site_${Date.now()}`;
    registry.ingestReport({ deviceId, name: 'Site Opta', platform: 'arduino-opta-mqtt-st', tags: [] });
    tenantStore.upsertDevice(tenantId, {
      deviceId,
      siteId: 'plant_summary',
      kind: 'controller',
      name: 'Site Opta',
    });
    const summary = siteControllerSummary('plant_summary', tenantId);
    assert.equal(summary.controllerCount, 1);
    assert.equal(summary.controllerOnline, true);
    assert.deepEqual(siteControllerSummary('empty_site', tenantId), {
      controllerCount: 0,
      controllerOnline: null,
      controllerCommissioned: false,
      controllerStale: false,
      controllerLastReportAt: null,
    });
  });

  it('resolveAssignTenantId uses site tenant for platform admin', () => {
    const siteTenant = tenantStore.createTenant({ tenantSlug: `ut_site_${Date.now()}`, name: 'Site Org' }).tenantId;
    const otherTenant = tenantStore.createTenant({ tenantSlug: `ut_other_${Date.now()}`, name: 'Other Org' }).tenantId;
    const req = {
      mvAuth: {
        user: { userId: 'admin1', role: 'platform_admin', tenantId: otherTenant },
        tenant: { tenantId: otherTenant },
      },
    };
    const site = { siteId: 'plant_a', tenantId: siteTenant };
    assert.equal(resolveAssignTenantId(req, site), siteTenant);
  });

  it('checked-in fence hides devices that do not match the org global site key', () => {
    const mine = 'opta_0123b636f1c20001';
    const other = 'opta_0123b636f1c20002';
    const bare = 'opta_0123b636f1c20003';
    registry.ingestReport({
      deviceId: mine,
      name: 'Mine',
      platform: 'arduino-opta-mqtt-st',
      tags: [],
      globalSiteKey: '0x0010',
    });
    registry.ingestReport({
      deviceId: other,
      name: 'Other',
      platform: 'arduino-opta-mqtt-st',
      tags: [],
      globalSiteKey: '0x0020',
    });
    registry.ingestReport({
      deviceId: bare,
      name: 'Bare',
      platform: 'arduino-opta-mqtt-st',
      tags: [],
    });
    const listed = listCheckedInUnassignedDevices({
      fence: { mode: 'keys', keys: new Set([0x0010]), includeUnfenced: false },
    });
    assert.equal(listed.some((d) => d.deviceId === mine), true);
    assert.equal(listed.some((d) => d.deviceId === other), false);
    assert.equal(listed.some((d) => d.deviceId === bare), false);
    const mineRow = listed.find((d) => d.deviceId === mine);
    assert.equal(mineRow.globalSiteKey, 0x0010);
    assert.equal(mineRow.globalSiteKeyHex, '0x0010');
    assert.equal(mineRow.globalSiteKeyDigits, '000016');
  });
});

describe('assign across organizations', () => {
  it('lists a device held by another org so the current org can take it', () => {
    const holder = tenantStore.createTenant({ tenantSlug: `ut_hold_${Date.now()}`, name: 'Holder' });
    const viewer = tenantStore.createTenant({ tenantSlug: `ut_view_${Date.now()}`, name: 'Viewer' });
    const deviceId = `mv_held_${Date.now().toString(16)}`;
    registry.ingestReport({
      deviceId,
      name: 'Held Opta',
      platform: 'arduino-opta-mqtt-st',
      tags: [],
    });
    tenantStore.upsertDevice(holder.tenantId, {
      deviceId,
      siteId: 'old_plant',
      kind: 'controller',
      name: 'Held Opta',
    });
    const hidden = listCheckedInUnassignedDevices();
    assert.equal(hidden.some((d) => d.deviceId === deviceId), false);
    const listed = listCheckedInUnassignedDevices({ tenantId: viewer.tenantId });
    const row = listed.find((d) => d.deviceId === deviceId);
    assert.ok(row, 'foreign-held device should appear for the viewing org');
    assert.equal(row.foreignAssignment.assignedSiteId, 'old_plant');
    assert.equal(row.foreignAssignment.assignedTenantId, holder.tenantId);
  });

  it('platform admin releases a leftover assignment in another org', () => {
    const holder = tenantStore.createTenant({ tenantSlug: `ut_from_${Date.now()}`, name: 'From Org' });
    const target = tenantStore.createTenant({ tenantSlug: `ut_to_${Date.now()}`, name: 'To Org' });
    const deviceId = `opta_ut_move_${Date.now()}`;
    tenantStore.upsertDevice(holder.tenantId, {
      deviceId,
      siteId: '7767_Land_O_Lakes_Blvd',
      kind: 'controller',
    });
    const req = { mvAuth: { user: { userId: 'admin1', role: 'platform_admin' } } };
    const result = takeForeignAssignment(req, tenantStore.findAssignedDevice(deviceId), target.tenantId);
    assert.equal(result.ok, true);
    assert.equal(result.moved, true);
    assert.equal(tenantStore.findAssignedDevice(deviceId), null);
    assert.equal(tenantStore.getDevice(holder.tenantId, deviceId).siteId, '');
  });

  it('tenant admin cannot take a device held by an org they cannot access', () => {
    const holder = tenantStore.createTenant({ tenantSlug: `ut_lock_${Date.now()}`, name: 'Locked Org' });
    const target = tenantStore.createTenant({ tenantSlug: `ut_need_${Date.now()}`, name: 'Need Org' });
    const deviceId = `opta_ut_lock_${Date.now()}`;
    tenantStore.upsertDevice(holder.tenantId, {
      deviceId,
      siteId: 'other_site',
      kind: 'controller',
    });
    const req = {
      mvAuth: {
        user: { userId: 'tech1', role: 'tenant_admin', tenantId: target.tenantId },
      },
    };
    const result = takeForeignAssignment(req, tenantStore.findAssignedDevice(deviceId), target.tenantId);
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.match(result.body.error, /already assigned to Locked Org/);
    assert.equal(tenantStore.findAssignedDevice(deviceId).tenantId, holder.tenantId);
  });

  it('hides a global 01 Opta assigned onto a global 02 org', () => {
    const org02 = tenantStore.createTenant({ tenantSlug: `ut_g02_${Date.now()}`, name: 'Org 02' });
    const orgKey = Number(org02.globalSiteKey);
    const deviceKey = orgKey === 1 ? 2 : 1;
    const deviceId = `mv_g01_${Date.now().toString(16)}`;
    registry.ingestReport({
      deviceId,
      name: 'Wrong fence Opta',
      platform: 'arduino-opta-mqtt-st',
      tags: [],
      globalSiteKey: deviceKey,
    });
    tenantStore.upsertDevice(org02.tenantId, {
      deviceId,
      siteId: 'site_g02',
      kind: 'controller',
      commissioning: 'commissioned',
    });
    assert.equal(controllerAllowedOnTenant(deviceId, org02.tenantId), false);
    const summary = siteControllerSummary('site_g02', org02.tenantId);
    assert.equal(summary.controllerCount, 0);
  });
});

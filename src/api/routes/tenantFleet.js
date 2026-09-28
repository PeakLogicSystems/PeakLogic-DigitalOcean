'use strict';

const express = require('express');
const { tenantStore } = require('../../tenants/tenantStore');
const { siteStore } = require('../../cloud/siteStore');
const { isAgentOnline } = require('../../cloud/agentHub');
const { resolveParcRegistry } = require('../../parc/deviceRegistry');
const { isParcRegistryNoiseId } = require('../../devices/bulkAddParcOpta');
const { isFieldParcDeviceId } = require('../../parc/optaSerial');
const { cellularSummaryFromDevice } = require('../../cellular/deviceCellularSync');
const {
  requireAuth,
  requireTenantAccess,
  activeTenantId,
} = require('../../tenants/authMiddleware');
const { isCloudDeployment } = require('../../cloud/agentProtocol');
const { FLORIDA_COUNTIES, countyBySlug } = require('../../fleet/floridaCounties');
const { latLngToPercent } = require('../../fleet/mapProjection');
const { buildSiteHmiUrl } = require('../../fleet/siteHmi');
const { siteFleetStatus } = require('../../fleet/siteFleetStatus');
const {
  deviceGlobalSiteKey,
  deviceMatchesFence,
  deviceAllowedOnTenant,
  visibleKeysForTenant,
  tryParseSiteKey,
  publicSiteKeyFields,
} = require('../../parc/commissionFence');

function isAssignableParcDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id || isParcRegistryNoiseId(id)) return false;
  if (/^sim_/i.test(id)) return false;
  if (isCloudDeployment()) return isFieldParcDeviceId(id);
  return true;
}

function fenceScopeForRequest(req) {
  const user = req.mvAuth?.user;
  if (user?.role === 'platform_admin' && (req.query?.all === '1' || req.query?.all === 'true')) {
    return { mode: 'all' };
  }
  const tid = activeTenantId(req);
  const tenant = tid ? tenantStore.getTenant(tid) : null;
  const keys = visibleKeysForTenant(tenant);
  return { mode: 'keys', keys, includeUnfenced: false, tenant };
}

function checkedInRow(d, full) {
  const cell = cellularSummaryFromDevice(full);
  const siteKey = deviceGlobalSiteKey(full);
  return {
    deviceId: d.deviceId,
    name: d.name || d.deviceId,
    platform: d.platform || '',
    serial: full?.meta?.ateccSerial || full?.meta?.serialNumber || '',
    lastReportAt: d.lastReportAt,
    ageSec: d.ageSec,
    online: !d.stale,
    stale: !!d.stale,
    tagCount: d.tagCount || 0,
    firmware: full?.meta?.firmwareVersion || '',
    gatewayId: cell.gatewayId || '',
    iccid: cell.iccid || '',
    eid: cell.eid || '',
    sim: cell.sim || '',
    modemSynced: cell.modemSynced,
    cellular: full?.meta?.cellular || null,
    pendingTelemetry: !!full?.meta?.pendingTelemetry,
    source: 'parc_registry',
    ...publicSiteKeyFields(siteKey),
    fenced: siteKey != null,
  };
}

function assignmentPublic(taken) {
  if (!taken) return null;
  const holder = tenantStore.getTenant(taken.tenantId);
  return {
    assignedTenantId: taken.tenantId,
    assignedTenantSlug: holder?.tenantSlug || taken.tenantId,
    assignedTenantName: holder?.name || 'deleted organization',
    assignedSiteId: String(taken.siteId || '').trim(),
    holderMissing: !holder,
  };
}

/** Platform admin, partner who can see the holding org, or a leftover after the org was deleted. */
function canMoveAssignment(req, taken) {
  if (!taken) return true;
  if (!tenantStore.getTenant(taken.tenantId)) return true;
  if (req?.mvAuth?.user?.role === 'platform_admin') return true;
  const userId = req?.mvAuth?.user?.userId;
  const user = userId ? tenantStore.getUser(userId) : null;
  return !!(user && tenantStore.userCanAccessTenant(user, taken.tenantId));
}

/**
 * Release a leftover assignment in another org so this site can take the Opta.
 * Same-org assignments are left for upsert to update.
 */
function takeForeignAssignment(req, taken, targetTid) {
  if (!taken || taken.tenantId === targetTid) {
    return { ok: true, moved: false };
  }
  const info = assignmentPublic(taken);
  if (!canMoveAssignment(req, taken)) {
    return {
      ok: false,
      status: 409,
      body: {
        error: `Device already assigned to ${info.assignedTenantName} (${info.assignedTenantSlug}) · site ${info.assignedSiteId}`,
        canReassign: false,
        ...info,
      },
    };
  }
  tenantStore.unassignDevice(taken.tenantId, taken.deviceId);
  return { ok: true, moved: true, from: info };
}

function isForeignAssignment(taken, tenantId) {
  const tid = String(tenantId || '').trim();
  return !!(taken && tid && taken.tenantId !== tid);
}

/** Hide an Opta from this org when telemetry is fenced to a different global site key. */
function controllerAllowedOnTenant(deviceId, tenantId) {
  const tenant = tenantStore.getTenant(tenantId);
  if (!tenant) return false;
  const parc = resolveParcRegistry().getDevice(deviceId);
  if (!parc) return true;
  return deviceAllowedOnTenant(parc, tenant);
}

/** Parc registry devices not yet linked to a site (includes stale — Opta may show MQTT connected before cloud ingests telemetry). */
function listCheckedInUnassignedDevices(opts = {}) {
  const fence = opts.fence || { mode: 'all' };
  const viewerTid = String(opts.tenantId || '').trim();
  const reg = resolveParcRegistry();
  return reg.listDevices()
    .filter((d) => {
      if (!isAssignableParcDeviceId(d.deviceId)) return false;
      if (!d.lastReportAt) return false;
      const taken = tenantStore.findAssignedDevice(d.deviceId);
      if (taken && !isForeignAssignment(taken, viewerTid)) return false;
      if (fence.mode === 'all') return true;
      const full = reg.getDevice(d.deviceId);
      const key = deviceGlobalSiteKey(full);
      if (key == null) return fence.includeUnfenced === true;
      return deviceMatchesFence(full, fence.keys);
    })
    .map((d) => {
      const row = checkedInRow(d, reg.getDevice(d.deviceId));
      const taken = tenantStore.findAssignedDevice(d.deviceId);
      if (isForeignAssignment(taken, viewerTid)) {
        row.foreignAssignment = assignmentPublic(taken);
      }
      return row;
    })
    .sort((a, b) => String(b.lastReportAt).localeCompare(String(a.lastReportAt)));
}

function liveParcStatus(deviceId) {
  const parc = resolveParcRegistry().getDevice(deviceId);
  if (!parc || !parc.lastReportAt) return null;
  return {
    online: !parc.stale,
    stale: !!parc.stale,
    lastReportAt: parc.lastReportAt,
  };
}

function isControllerRow(d) {
  if (!d || !d.deviceId) return false;
  const id = String(d.deviceId);
  if (id.startsWith('site-agent:') || id.startsWith('cam:')) return false;
  const kind = String(d.kind || 'controller').trim();
  return kind === 'controller';
}

/** Merge live Parc telemetry into assigned controller rows (stored online is not refreshed otherwise). */
function enrichControllerDevice(d) {
  if (!isControllerRow(d)) return d;
  const live = liveParcStatus(d.deviceId);
  if (!live) return d;
  return { ...d, online: live.online, stale: live.stale, lastReportAt: live.lastReportAt };
}

function siteControllerSummary(siteId, tenantId) {
  const sid = String(siteId || '').trim();
  const controllers = tenantStore.listDevices(tenantId)
    .filter((d) => String(d.siteId || '').trim() === sid && isControllerRow(d))
    .filter((d) => controllerAllowedOnTenant(d.deviceId, tenantId));
  if (!controllers.length) {
    return {
      controllerCount: 0,
      controllerOnline: null,
      controllerCommissioned: false,
      controllerStale: false,
      controllerLastReportAt: null,
    };
  }
  let anyOnline = false;
  let lastReportAt = null;
  for (const d of controllers) {
    const live = liveParcStatus(d.deviceId);
    if (live?.lastReportAt && (!lastReportAt || live.lastReportAt > lastReportAt)) {
      lastReportAt = live.lastReportAt;
    }
    if (live && live.online) anyOnline = true;
  }
  const commissioned = controllers.every((d) => String(d.commissioning || '').trim() === 'commissioned');
  return {
    controllerCount: controllers.length,
    controllerOnline: anyOnline,
    controllerCommissioned: commissioned,
    controllerStale: !anyOnline,
    controllerLastReportAt: lastReportAt,
  };
}

/** Device records belong to the site's tenant — not always the session tenant (platform admin org switch). */
function resolveAssignTenantId(req, site) {
  if (!site?.tenantId) return null;
  const sessionTid = activeTenantId(req);
  const isAdmin = req.mvAuth?.user?.role === 'platform_admin';
  if (!isAdmin && site.tenantId !== sessionTid) return null;
  if (!isAdmin) {
    const user = tenantStore.getUser(req.mvAuth.user.userId);
    if (!user || !tenantStore.userCanAccessTenant(user, site.tenantId)) return null;
  }
  return site.tenantId;
}

function createTenantFleetRoutes() {
  const router = express.Router();

  // Skip this entire router on appliance — do NOT 404 here or every /api/* dies.
  router.use((req, res, next) => {
    if (!isCloudDeployment()) return next('router');
    next();
  });

  router.get('/sites/devices/checked-in', requireAuth, requireTenantAccess, (req, res) => {
    const fence = fenceScopeForRequest(req);
    const tenantFields = publicSiteKeyFields(fence.tenant?.globalSiteKey);
    res.json({
      devices: listCheckedInUnassignedDevices({ fence, tenantId: activeTenantId(req) }),
      fence: {
        mode: fence.mode,
        ...tenantFields,
      },
    });
  });

  router.get('/tenant/commission-key', requireAuth, (req, res) => {
    const tid = activeTenantId(req);
    const tenant = tid ? tenantStore.publicTenant(tenantStore.getTenant(tid)) : null;
    if (!tenant && req.mvAuth.user.role !== 'platform_admin') {
      return res.status(404).json({ error: 'No tenant' });
    }
    res.json({
      ok: true,
      ...publicSiteKeyFields(tenant?.globalSiteKey),
      tenantId: tenant?.tenantId || null,
      tenantSlug: tenant?.tenantSlug || null,
    });
  });

  router.post('/sites/devices/claim', requireAuth, requireTenantAccess, (req, res) => {
    const deviceId = String(req.body?.deviceId || '').trim();
    const entered = tryParseSiteKey(req.body?.globalSiteKey ?? req.body?.siteKey ?? req.body?.commissionCode);
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }
    if (entered == null) {
      return res.status(400).json({ error: 'globalSiteKey required (0x0001–0xFFFF or 000001–065535)' });
    }
    const fence = fenceScopeForRequest(req);
    if (fence.mode !== 'all' && !fence.keys.has(entered)) {
      return res.status(403).json({ error: 'globalSiteKey does not match this organization' });
    }
    const assigned = tenantStore.findAssignedDevice(deviceId);
    if (assigned) {
      return res.status(409).json({ error: 'Device already assigned to a site' });
    }
    const reg = resolveParcRegistry();
    let parc = reg.getDevice(deviceId);
    if (!parc) {
      return res.status(404).json({ error: 'Device has not checked in to MQTT' });
    }
    const current = deviceGlobalSiteKey(parc);
    if (current != null && current !== entered) {
      return res.status(409).json({ error: 'Device is fenced to a different global site key' });
    }
    if (typeof reg.patchDeviceMeta === 'function') {
      parc = reg.patchDeviceMeta(deviceId, { globalSiteKey: entered }) || parc;
    }
    const row = checkedInRow(parc, parc);
    res.json({ ok: true, device: row, fence: publicSiteKeyFields(entered) });
  });

  router.get('/sites/devices', requireAuth, requireTenantAccess, (req, res) => {
    const tid = activeTenantId(req);
    const manual = tenantStore.listDevices(tid);
    const cameras = siteStore.listCameras().filter((c) => {
      const site = siteStore.getSite(c.siteId);
      return site && site.tenantId === tid;
    }).map((c) => ({
      deviceId: `cam:${c.cameraId}`,
      tenantId: tid,
      siteId: c.siteId,
      name: c.name || c.cameraId,
      kind: 'camera',
      serial: c.model || '',
      sim: '',
      online: isAgentOnline(c.siteId),
      commissioning: c.probeStatus === 'ok' ? 'commissioned' : (c.probeStatus || 'unknown'),
      firmware: '',
      source: 'camera_catalog',
    }));
    const controllers = manual
      .filter(isControllerRow)
      .filter((d) => controllerAllowedOnTenant(d.deviceId, tid))
      .map((d) => {
        const enriched = enrichControllerDevice(d);
        const parc = resolveParcRegistry().getDevice(d.deviceId);
        const keyFields = publicSiteKeyFields(deviceGlobalSiteKey(parc));
        const taken = tenantStore.findAssignedDevice(d.deviceId);
        if (isForeignAssignment(taken, tid)) {
          return { ...enriched, ...keyFields, foreignAssignment: assignmentPublic(taken) };
        }
        return { ...enriched, ...keyFields };
      });
    const byId = new Map();
    for (const d of [...cameras, ...controllers]) byId.set(d.deviceId, d);
    res.json({ devices: [...byId.values()] });
  });

  router.post('/sites/devices', requireAuth, requireTenantAccess, (req, res) => {
    const body = req.body || {};
    const deviceId = String(body.deviceId || '').trim();
    const siteId = String(body.siteId || '').trim();
    if (!siteId) {
      return res.status(400).json({ error: 'siteId required' });
    }
    const site = siteStore.getSite(siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }
    const tid = resolveAssignTenantId(req, site);
    if (!tid) {
      return res.status(404).json({ error: 'Site not found for this organization' });
    }
    if (deviceId) {
      const taken = tenantStore.findAssignedDevice(deviceId);
      const released = takeForeignAssignment(req, taken, tid);
      if (!released.ok) {
        return res.status(released.status).json(released.body);
      }
      const parc = resolveParcRegistry().getDevice(deviceId);
      if (parc) {
        const siteTenant = tenantStore.getTenant(tid);
        if (siteTenant && !deviceAllowedOnTenant(parc, siteTenant)) {
          const have = publicSiteKeyFields(deviceGlobalSiteKey(parc));
          const want = publicSiteKeyFields(siteTenant.globalSiteKey);
          return res.status(403).json({
            error: `Device global site key ${have.globalSiteKeyHex || 'unset'} does not match this organization (${want.globalSiteKeyHex || 'unset'}) — set the key on Opta /setup`,
          });
        }
      }
      if (parc) {
        const cell = cellularSummaryFromDevice(parc);
        body.name = body.name || parc.name || deviceId;
        body.serial = body.serial || parc.meta?.ateccSerial || parc.meta?.serialNumber || '';
        body.kind = body.kind || 'controller';
        body.firmware = body.firmware || parc.meta?.firmwareVersion || '';
        body.commissioning = body.commissioning || 'commissioned';
        body.online = body.online != null ? !!body.online : !parc.stale;
        body.gatewayId = body.gatewayId || cell.gatewayId || '';
        body.iccid = body.iccid || cell.iccid || '';
        body.eid = body.eid || cell.eid || '';
        body.sim = body.sim || cell.sim || body.iccid || '';
      }
    }
    const device = tenantStore.upsertDevice(tid, body);
    res.status(201).json({ device });
  });

  router.delete('/sites/devices/:deviceId', requireAuth, requireTenantAccess, (req, res) => {
    const deviceId = String(req.params.deviceId || '').trim();
    if (!deviceId || deviceId.startsWith('cam:') || deviceId.startsWith('site-agent:')) {
      return res.status(400).json({ error: 'Invalid controller deviceId' });
    }
    const assigned = tenantStore.findAssignedDevice(deviceId);
    if (!assigned) {
      return res.status(404).json({ error: 'Device is not assigned to a site' });
    }
    const sessionTid = activeTenantId(req);
    const isAdmin = req.mvAuth?.user?.role === 'platform_admin';
    if (!isAdmin && assigned.tenantId !== sessionTid) {
      return res.status(404).json({ error: 'Device not found' });
    }
    if (!isAdmin) {
      const user = tenantStore.getUser(req.mvAuth.user.userId);
      if (!user || !tenantStore.userCanAccessTenant(user, assigned.tenantId)) {
        return res.status(404).json({ error: 'Device not found' });
      }
    }
    const device = tenantStore.unassignDevice(assigned.tenantId, deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ device, unassigned: true });
  });

  router.get('/fleet', requireAuth, requireTenantAccess, (req, res) => {
    const tid = activeTenantId(req);
    const isAdmin = req.mvAuth?.user?.role === 'platform_admin';
    const assets = tenantStore.listAssets(tid);
    const counties = FLORIDA_COUNTIES.map((c) => {
      const pos = latLngToPercent(c.lat, c.lng);
      return { ...c, x: pos.x, y: pos.y, kind: 'county' };
    });
    const sites = siteStore.listSites()
      .filter((s) => isAdmin || s.tenantId === tid)
      .map((s) => {
        let lat = s.lat;
        let lng = s.lng;
        if ((lat == null || lng == null) && s.county) {
          const county = countyBySlug(s.county);
          if (county) {
            lat = county.lat;
            lng = county.lng;
          }
        }
        const pos = lat != null && lng != null ? latLngToPercent(lat, lng) : null;
        const status = siteFleetStatus(s.siteId, s.tenantId);
        return {
          siteId: s.siteId,
          name: s.name,
          address: s.address || '',
          county: s.county || '',
          x: pos?.x,
          y: pos?.y,
          kind: 'site',
          status,
          hmiUrl: buildSiteHmiUrl(s),
          controllerCount: controllersForSiteCount(s.siteId, s.tenantId),
        };
      })
      .filter((s) => s.x != null && s.y != null);
    res.json({ assets, counties, sites, countyCount: counties.length });
  });

  function controllersForSiteCount(siteId, tenantId) {
    const sid = String(siteId || '').trim();
    return tenantStore.listDevices(tenantId)
      .filter((d) => String(d.siteId || '').trim() === sid && isControllerRow(d)).length;
  }

  router.post('/fleet', requireAuth, requireTenantAccess, (req, res) => {
    const tid = activeTenantId(req);
    const asset = tenantStore.upsertAsset(tid, req.body || {});
    res.status(201).json({ asset });
  });

  router.delete('/fleet/:assetId', requireAuth, requireTenantAccess, (req, res) => {
    const tid = activeTenantId(req);
    const ok = tenantStore.deleteAsset(tid, req.params.assetId);
    if (!ok) return res.status(404).json({ error: 'Asset not found' });
    res.json({ ok: true });
  });

  router.get('/tenant/cmms', requireAuth, requireTenantAccess, (req, res) => {
    const tid = activeTenantId(req);
    const tenant = tenantStore.publicTenant(tenantStore.getTenant(tid));
    const enabled = !!(tenant && tenant.cmmsEnabled);
    res.json({
      cmmsEnabled: enabled,
      integrated: enabled,
      externalUrl: tenant?.cmmsExternalUrl || '',
      message: enabled
        ? 'Integrated CMMS enabled for this organization'
        : 'CMMS not enabled — ask a platform admin (PATCH /api/admin/tenants/:id/cmms)',
    });
  });

  return router;
}

module.exports = {
  createTenantFleetRoutes,
  listCheckedInUnassignedDevices,
  isAssignableParcDeviceId,
  enrichControllerDevice,
  siteControllerSummary,
  liveParcStatus,
  resolveAssignTenantId,
  isControllerRow,
  fenceScopeForRequest,
  assignmentPublic,
  canMoveAssignment,
  takeForeignAssignment,
  controllerAllowedOnTenant,
};

'use strict';

const express = require('express');
const { tenantStore } = require('../../tenants/tenantStore');
const { resolveParcRegistry } = require('../../parc/deviceRegistry');
const { getMqttCentralHub } = require('../../parc/mqttCentralHub');
const { cloudMqttParcSettingsFromEnv } = require('../../parc/cloudParcHubBoot');
const mongoSysLog = require('../../logger/mongoSysLog');
const {
  requireAuth,
  requirePlatformAdmin,
  activeTenantId,
} = require('../../tenants/authMiddleware');
const { isCloudDeployment } = require('../../cloud/agentProtocol');
const { isPartnerRole } = require('../../tenants/tenantRoles');
const {
  deviceGlobalSiteKey,
  tryParseSiteKey,
  publicSiteKeyFields,
  visibleKeysForTenant,
  deviceAllowedOnTenant,
} = require('../../parc/commissionFence');
const { listCheckedInUnassignedDevices } = require('./tenantFleet');

function requireMqttConsoleAccess(req, res, next) {
  if (!req.mvAuth?.user) return res.status(401).json({ error: 'Authentication required' });
  const role = req.mvAuth.user.role;
  if (role === 'platform_admin' || role === 'partner_admin') return next();
  return res.status(403).json({ error: 'MQTT console requires platform admin or partner admin' });
}

function mqttScope(req) {
  const user = req.mvAuth.user;
  if (user.role === 'platform_admin') {
    return { kind: 'all', tenantIds: null, keys: null };
  }
  const homeId = user.tenantId;
  const home = tenantStore.getTenant(homeId);
  const customers = homeId ? tenantStore.listLinkedCustomers(homeId) : [];
  const tenantIds = [homeId, ...customers.map((c) => c.tenantId)].filter(Boolean);
  const keys = new Set();
  for (const id of tenantIds) {
    const t = tenantStore.getTenant(id);
    for (const k of visibleKeysForTenant(t)) keys.add(k);
  }
  return { kind: 'partner', tenantIds, keys, home };
}

function orgSummaries(scope) {
  const tenants = scope.kind === 'all'
    ? tenantStore.listTenants()
    : scope.tenantIds.map((id) => tenantStore.publicTenant(tenantStore.getTenant(id))).filter(Boolean);
  const assigned = [];
  for (const t of tenants) {
    assigned.push(...tenantStore.listDevices(t.tenantId).map((d) => ({ ...d, tenantId: t.tenantId })));
  }
  const assignedById = new Map(assigned.map((d) => [d.deviceId, d]));
  const reg = resolveParcRegistry();
  return tenants.map((t) => {
    const key = tryParseSiteKey(t.globalSiteKey);
    const devices = assigned.filter((d) => {
      if (d.tenantId !== t.tenantId || d.kind === 'camera') return false;
      const parc = reg.getDevice(d.deviceId);
      return !parc || deviceAllowedOnTenant(parc, t);
    });
    let online = 0;
    let lastReportAt = null;
    for (const d of devices) {
      const parc = reg.getDevice(d.deviceId);
      if (parc && !parc.stale) online += 1;
      if (parc?.lastReportAt && (!lastReportAt || parc.lastReportAt > lastReportAt)) {
        lastReportAt = parc.lastReportAt;
      }
    }
    const checkedIn = listCheckedInUnassignedDevices({
      fence: { mode: 'keys', keys: new Set(key != null ? [key] : []), includeUnfenced: false },
      tenantId: t.tenantId,
    }).length;
    return {
      ...t,
      deviceCount: devices.length,
      onlineCount: online,
      checkedInCount: checkedIn,
      lastReportAt,
      assignedDeviceIds: devices.map((d) => d.deviceId),
    };
  });
}

function scopedDevices(scope) {
  const reg = resolveParcRegistry();
  const rows = [];
  for (const summary of reg.listDevices()) {
    const full = reg.getDevice(summary.deviceId);
    const key = deviceGlobalSiteKey(full);
    const assignment = tenantStore.findAssignedDevice(summary.deviceId);
    if (scope.kind !== 'all') {
      const keyOk = key != null && scope.keys.has(key);
      const assignOk = key == null && assignment && scope.tenantIds.includes(assignment.tenantId);
      if (!keyOk && !assignOk) continue;
    }
    const keyOwner = key != null
      ? tenantStore.publicTenant(tenantStore.findTenantByGlobalSiteKey(key))
      : null;
    const assignOwner = assignment
      ? tenantStore.publicTenant(tenantStore.getTenant(assignment.tenantId))
      : null;
    const owner = keyOwner || assignOwner;
    rows.push({
      deviceId: summary.deviceId,
      name: full?.name || summary.name || summary.deviceId,
      platform: full?.platform || summary.platform || '',
      lastReportAt: summary.lastReportAt,
      online: !summary.stale,
      stale: !!summary.stale,
      assigned: !!assignment,
      siteId: assignment?.siteId || null,
      tenantId: assignment?.tenantId || owner?.tenantId || null,
      tenantSlug: owner?.tenantSlug || null,
      tenantName: owner?.name || null,
      ...publicSiteKeyFields(key),
      fenced: key != null,
    });
  }
  return rows.sort((a, b) => String(b.lastReportAt || '').localeCompare(String(a.lastReportAt || '')));
}

function hubPublicStatus(isPlatformAdmin) {
  const hub = getMqttCentralHub(resolveParcRegistry());
  const status = hub.status();
  const env = isCloudDeployment() ? cloudMqttParcSettingsFromEnv() : {};
  return {
    connected: !!status.connected,
    enabled: status.enabled !== false,
    brokerUrl: isPlatformAdmin ? (status.brokerUrl || env.brokerUrl || null) : (status.connected ? 'connected' : 'offline'),
    pendingCommands: status.pendingCommands || 0,
    cloudTenantIngest: env.cloudTenantIngest === true,
  };
}

function createMqttConsoleRoutes() {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!isCloudDeployment()) return next('router');
    next();
  });

  router.get('/mqtt-console', requireAuth, requireMqttConsoleAccess, async (req, res) => {
    const scope = mqttScope(req);
    const isAdmin = req.mvAuth.user.role === 'platform_admin';
    const orgs = orgSummaries(scope);
    const devices = scopedDevices(scope);
    res.json({
      ok: true,
      scope: scope.kind,
      hub: hubPublicStatus(isAdmin),
      orgs,
      devices,
      unfencedCount: isAdmin ? devices.filter((d) => !d.fenced && !d.assigned).length : 0,
    });
  });

  router.get('/mqtt-console/traffic', requireAuth, requireMqttConsoleAccess, async (req, res) => {
    const scope = mqttScope(req);
    const devices = scopedDevices(scope);
    const allowedIds = new Set(devices.map((d) => d.deviceId));
    const allowedTenants = scope.tenantIds ? new Set(scope.tenantIds) : null;
    try {
      const entries = await mongoSysLog.query({ category: 'mqtt' }, {
        limit: req.query.limit || 200,
        since: req.query.since,
        until: req.query.until,
      });
      const filtered = scope.kind === 'all'
        ? entries
        : entries.filter((e) => {
          const id = e.detail?.deviceId || e.detail?.clientId;
          const tid = e.detail?.tenantId;
          if (id && allowedIds.has(id)) return true;
          if (tid && allowedTenants && allowedTenants.has(tid)) return true;
          return false;
        });
      res.json({ ok: true, scope: scope.kind, entries: filtered });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/mqtt-console/devices/:id/fence', requireAuth, requireMqttConsoleAccess, (req, res) => {
    const deviceId = String(req.params.id || '').trim();
    const key = tryParseSiteKey(req.body?.globalSiteKey ?? req.body?.siteKey);
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
    if (key == null) {
      return res.status(400).json({ error: 'globalSiteKey required (0x0001–0xFFFF or 000001–065535)' });
    }
    const scope = mqttScope(req);
    if (scope.kind !== 'all' && !scope.keys.has(key)) {
      return res.status(403).json({ error: 'Can only bind devices to your organization site key' });
    }
    const reg = resolveParcRegistry();
    const parc = reg.getDevice(deviceId);
    if (!parc) return res.status(404).json({ error: 'Device has not checked in to MQTT' });
    const updated = reg.patchDeviceMeta(deviceId, { globalSiteKey: key });
    const owner = tenantStore.publicTenant(tenantStore.findTenantByGlobalSiteKey(key));
    res.json({
      ok: true,
      device: {
        deviceId,
        ...publicSiteKeyFields(key),
        tenantId: owner?.tenantId || null,
        tenantSlug: owner?.tenantSlug || null,
      },
      deviceRecord: updated,
    });
  });

  router.patch('/mqtt-console/tenants/:id/site-key', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      const tenant = tenantStore.setGlobalSiteKey(req.params.id, req.body?.globalSiteKey ?? req.body?.siteKey);
      res.json({ ok: true, tenant });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
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

  return router;
}

module.exports = {
  createMqttConsoleRoutes,
  requireMqttConsoleAccess,
  mqttScope,
};

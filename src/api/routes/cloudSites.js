'use strict';

const { siteStore } = require('../../cloud/siteStore');
const {
  openViewerSession,
  renderCloudPlayerHtml,
  isAgentOnline,
  listOnlineSiteIds,
  disconnectAgent,
} = require('../../cloud/agentHub');
const siteAgent = require('../../cloud/siteAgent');
const { isCloudDeployment } = require('../../cloud/agentProtocol');
const {
  listCheckedInUnassignedDevices,
  siteControllerSummary,
} = require('./tenantFleet');
const {
  requireAuth,
  requireTenantAccess,
  activeTenantId,
} = require('../../tenants/authMiddleware');
const { countyBySlug } = require('../../fleet/floridaCounties');

function applyCountyCoords(body) {
  const out = { ...body };
  if ((!out.lat || !out.lng) && out.county) {
    const county = countyBySlug(out.county);
    if (county) {
      out.lat = county.lat;
      out.lng = county.lng;
    }
  }
  return out;
}

function createCloudSiteRoutes() {
  const router = require('express').Router();

  router.get('/cloud/status', (req, res) => {
    const onlineIds = listOnlineSiteIds();
    res.json({
      deployment: isCloudDeployment() ? 'cloud' : 'appliance',
      cloudSitesEnabled: isCloudDeployment(),
      multiTenant: isCloudDeployment(),
      agent: siteAgent.status(),
      sites: isCloudDeployment() ? siteStore.listSites().length : 0,
      remoteAgentsOnline: onlineIds,
      remoteAgentCount: onlineIds.length,
    });
  });

  // --- Appliance agent config (always available on edge) ---
  router.get('/cloud/agent', (req, res) => {
    res.json({ agent: siteAgent.status(), config: siteAgent.loadConfig() });
  });

  router.put('/cloud/agent', (req, res) => {
    const body = req.body || {};
    const agent = siteAgent.updateConfig({
      enabled: body.enabled,
      cloudUrl: body.cloudUrl,
      siteId: body.siteId,
      pairingCode: body.pairingCode,
      agentToken: body.agentToken,
      heartbeatMs: body.heartbeatMs,
      inventoryMs: body.inventoryMs,
    });
    res.json({ agent });
  });

  router.post('/cloud/agent/start', async (req, res) => {
    try {
      const agent = await siteAgent.start();
      res.json({ agent });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cloud/agent/stop', (req, res) => {
    res.json({ agent: siteAgent.stop() });
  });

  router.post('/cloud/agent/sync', (req, res) => {
    siteAgent.pushInventory();
    res.json({ ok: true, agent: siteAgent.status() });
  });

  const cloudEnabled = () => isCloudDeployment();

  function assertSiteTenant(req, site) {
    if (!site) return false;
    if (req.mvAuth?.user?.role === 'platform_admin') return true;
    const tid = activeTenantId(req);
    return !!(tid && site.tenantId === tid);
  }

  router.get('/sites', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) {
      return res.status(404).json({ error: 'Cloud sites API requires PEAKLOGIC_DEPLOYMENT=cloud' });
    }
    const tid = activeTenantId(req);
    const isAdmin = req.mvAuth.user.role === 'platform_admin';
    const unassignedCheckIn = listCheckedInUnassignedDevices({ tenantId: tid }).length;
    const sites = siteStore.listSites()
      .filter((s) => isAdmin || s.tenantId === tid)
      .map((s) => ({
        ...s,
        agentOnline: !!(s.agentOnline || isAgentOnline(s.siteId)),
        ...siteControllerSummary(s.siteId, s.tenantId),
      }));
    res.json({ sites, settings: siteStore.settings(), tenantId: tid, unassignedCheckIn });
  });

  router.post('/sites', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) {
      return res.status(404).json({ error: 'Cloud sites API requires PEAKLOGIC_DEPLOYMENT=cloud' });
    }
    try {
      const tid = activeTenantId(req);
      const body = { ...(req.body || {}), tenantId: tid || req.body?.tenantId };
      if (!body.tenantId) {
        return res.status(400).json({ error: 'tenantId required' });
      }
      const created = siteStore.createSite(applyCountyCoords(body));
      res.status(201).json(created);
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.patch('/sites/:siteId', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const site = siteStore.getSite(req.params.siteId);
    if (!site || !assertSiteTenant(req, site)) return res.status(404).json({ error: 'Site not found' });
    try {
      const updated = siteStore.updateSite(req.params.siteId, applyCountyCoords(req.body || {}));
      if (!updated) return res.status(404).json({ error: 'Site not found' });
      res.json({ site: updated });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/sites/:siteId', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const site = siteStore.getSite(req.params.siteId);
    if (!site || !assertSiteTenant(req, site)) return res.status(404).json({ error: 'Site not found' });
    res.json({
      site: {
        ...site,
        agentConnected: isAgentOnline(req.params.siteId),
      },
    });
  });

  router.delete('/sites/:siteId', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const site = siteStore.getSite(req.params.siteId);
    if (!site || !assertSiteTenant(req, site)) return res.status(404).json({ error: 'Site not found' });
    disconnectAgent(req.params.siteId);
    siteStore.deleteSite(req.params.siteId);
    res.json({ ok: true });
  });

  router.post('/sites/:siteId/repair', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const site = siteStore.getSite(req.params.siteId);
    if (!site || !assertSiteTenant(req, site)) return res.status(404).json({ error: 'Site not found' });
    const issued = siteStore.reissuePairing(req.params.siteId);
    if (!issued) return res.status(404).json({ error: 'Site not found' });
    disconnectAgent(req.params.siteId);
    res.json(issued);
  });

  // Appliance inventory backup (agent token auth — no JWT). Prefer WSS, HTTP fills gaps.
  router.post('/sites/:siteId/inventory', (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const siteId = String(req.params.siteId || '').trim();
    const token = String(req.headers['x-agent-token'] || req.query.token || '').trim();
    if (!siteStore.authenticateAgentToken(siteId, token)) {
      return res.status(401).json({ error: 'Invalid agent token' });
    }
    try {
      const cameras = Array.isArray(req.body?.cameras) ? req.body.cameras : [];
      console.log(`[cloud-sites] HTTP inventory site=${siteId} cameras=${cameras.length}`);
      const result = siteStore.mergeInventory(siteId, cameras);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/sites/:siteId/cameras', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const site = siteStore.getSite(req.params.siteId);
    if (!site || !assertSiteTenant(req, site)) return res.status(404).json({ error: 'Site not found' });
    res.json({
      siteId: req.params.siteId,
      agentOnline: site.agentOnline || isAgentOnline(req.params.siteId),
      cameras: siteStore.listCameras(req.params.siteId),
    });
  });

  router.get('/sites/:siteId/cameras/:cameraId', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const site = siteStore.getSite(req.params.siteId);
    if (!site || !assertSiteTenant(req, site)) return res.status(404).json({ error: 'Site not found' });
    const cam = siteStore.getCamera(req.params.siteId, req.params.cameraId);
    if (!cam) return res.status(404).json({ error: 'Camera not found in cloud catalog' });
    res.json({
      camera: cam,
      agentOnline: isAgentOnline(req.params.siteId),
    });
  });

  router.get('/sites/:siteId/cameras/:cameraId/player', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).send('Not found');
    const site = siteStore.getSite(req.params.siteId);
    if (!site || !assertSiteTenant(req, site)) return res.status(404).send('Not found');
    const opened = openViewerSession(req.params.siteId, req.params.cameraId);
    if (opened.error) {
      res.status(503).type('html').send(`<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;padding:1.5rem"><h2>Camera offline</h2><p>${String(opened.error).replace(/[<>&]/g, '')}</p>
        <p style="opacity:.7">Check site agent connectivity and appliance probe status.</p></div></body></html>`);
      return;
    }
    res.type('html').send(renderCloudPlayerHtml(req.params.siteId, req.params.cameraId, {
      sessionId: opened.sessionId,
    }));
  });

  router.get('/sites/:siteId/cameras/:cameraId/viewer', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const site = siteStore.getSite(req.params.siteId);
    if (!site || !assertSiteTenant(req, site)) return res.status(404).json({ error: 'Site not found' });
    const cam = siteStore.getCamera(req.params.siteId, req.params.cameraId);
    if (!cam) return res.status(404).json({ error: 'Camera not found' });
    res.json({
      siteId: req.params.siteId,
      cameraId: req.params.cameraId,
      name: cam.name,
      viewerUrl: `/api/sites/${encodeURIComponent(req.params.siteId)}/cameras/${encodeURIComponent(req.params.cameraId)}/player`,
      agentOnline: isAgentOnline(req.params.siteId),
      offline: !isAgentOnline(req.params.siteId),
    });
  });

  router.put('/sites/settings', requireAuth, requireTenantAccess, (req, res) => {
    if (!cloudEnabled()) return res.status(404).json({ error: 'Not found' });
    const settings = siteStore.updateSettings(req.body || {});
    res.json({ settings });
  });

  return router;
}

module.exports = { createCloudSiteRoutes };

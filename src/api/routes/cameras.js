'use strict';

const { registry, camerasSystemEnabled } = require('../../cameras/cameraRegistry');
const { discoverOnvif, dedupeHits } = require('../../cameras/onvifDiscover');
const { discoverOnvifSubnet, estimateSweepTimeoutMs } = require('../../cameras/subnetSweep');
const { expandDiscoveryHits, isReolinkHit } = require('../../cameras/reolink');
const { probeCamera } = require('../../cameras/cameraProbe');
const { streamCameraMjpeg } = require('../../cameras/cameraMjpeg');
const go2rtc = require('../../cameras/go2rtcManager');
const { renderPlayerHtml, renderPlayerSetupHtml } = require('../../cameras/go2rtcClient');
const snapshotService = require('../../cameras/cameraSnapshotService');
const { queryEvents } = require('../../cameras/cameraEvents');
const { viewerUrlForCamera } = require('../../cameras/reolink');
const { stopCameraSystem, startCameraSystem, restartCameraAiServices } = require('../../cameras/cameraSystemControl');
const cameraInference = require('../../cameras/cameraInference');
const cameraScheduler = require('../../cameras/cameraScheduler');
const cameraLiveSampler = require('../../cameras/cameraLiveSampler');
const cameraMotionMonitor = require('../../cameras/cameraMotionMonitor');
const mongoTagLogger = require('../../logger/mongoTagLogger');
const gridfs = require('../../storage/gridfsStore');
const { normalizeOverlays, overlaysForCamera } = require('../../cameras/cameraOverlays');
const cameraTagBridge = require('../../cameras/cameraTagBridge');
const { CAMERA_SYSTEM_DISABLED_MSG } = require('../../cameras/cameraMessages');

function resolveSweepPorts(settings, body = {}) {
  if (Array.isArray(body.sweepPorts) && body.sweepPorts.length) {
    return body.sweepPorts.map((p) => Number(p)).filter((p) => p > 0 && p <= 65535);
  }
  const onvifPort = Number(settings.onvifPort) || 8000;
  return Array.from(new Set([onvifPort, 80].filter((p) => p > 0 && p <= 65535)));
}

function isCamerasConfigRoute(req) {
  const path = req.path;
  const method = req.method;
  if (path === '/cameras/settings') return true;
  if (path === '/cameras' && method === 'GET') return true;
  if (path === '/cameras/overview' && method === 'GET') return true;
  if (path === '/cameras' && method === 'POST') return true;
  if (/^\/cameras\/[^/]+$/.test(path) && ['GET', 'PUT', 'DELETE'].includes(method)) return true;
  return false;
}

function resolveViewerUrl(camera, settings = registry.settings()) {
  if (camera.viewerUrl) return camera.viewerUrl;
  const cameraId = camera.cameraId;
  if (!cameraId) return '';
  const backend = settings.streamBackend || 'go2rtc';
  if (settings.go2rtcEnabled !== false && backend === 'go2rtc') {
    return viewerUrlForCamera(cameraId, { backend: 'go2rtc' });
  }
  if (camera.snapshotUrl || camera.rtspUrl) {
    return viewerUrlForCamera(cameraId, { backend: 'mjpeg' });
  }
  return '';
}

async function probeAndSave(cameraId, body = {}) {
  const rec = registry.getCameraRecord(cameraId);
  if (!rec) return { error: 'Camera not found', status: 404 };
  const settings = registry.settings();
  const creds = {
    username: body.username || rec.username || settings.defaultUsername || '',
    password: body.password || rec.password || settings.defaultPassword || '',
  };
  const merged = { ...rec, ...creds };
  const probe = await probeCamera(merged, {
    preferSubstream: body.preferSubstream ?? settings.preferSubstream !== false,
    rtspPort: Number(body.rtspPort) || settings.rtspPort || 554,
    timeoutMs: Number(body.timeoutMs) || 12000,
    apiBase: '/api',
    settings,
  });
  const camera = registry.applyProbe(cameraId, probe);
  if (probe.ok) {
    cameraMotionMonitor.startCamera(cameraId);
  }
  if (probe.ok && settings.snapshotArchiveEnabled) {
    captureAndStoreAfterProbe(cameraId).catch(() => {});
  }
  return { probe, camera };
}

async function captureAndStoreAfterProbe(cameraId) {
  try {
    await snapshotService.captureAndStore(cameraId, { reason: 'probe' });
  } catch {
    // Non-fatal — archive requires MongoDB
  }
}

async function probeCameraIds(cameraIds, body = {}) {
  const ids = [...new Set((cameraIds || []).filter(Boolean))];
  if (!ids.length) return { probed: [] };
  const probeBody = {
    ...body,
    timeoutMs: Number(body.probeTimeoutMs) || Number(body.timeoutMs) || 12000,
  };
  const results = [];
  for (const cameraId of ids) {
    try {
      const { probe, camera } = await probeAndSave(cameraId, probeBody);
      results.push({ cameraId, ok: probe.ok, camera, error: probe.error || '' });
    } catch (e) {
      results.push({ cameraId, ok: false, error: e.message || String(e) });
    }
  }
  return { probed: results };
}

async function probeAllCameras(body = {}) {
  const settings = registry.settings();
  const autoProbe = body.autoProbe != null ? !!body.autoProbe : settings.autoProbeOnDiscover !== false;
  if (!autoProbe) return { probed: [] };
  return probeCameraIds(registry.listCameraRecords().map((rec) => rec.cameraId), body);
}

function isCameraApiPath(path) {
  const p = String(path || '');
  return p.startsWith('/cameras') || p.startsWith('/go2rtc');
}

function createCameraRoutes() {
  const router = require('express').Router();

  router.use((req, res, next) => {
    if (!isCameraApiPath(req.path)) return next();
    if (camerasSystemEnabled(registry.settings())) return next();
    if (isCamerasConfigRoute(req)) return next();
    res.status(503).json({ error: CAMERA_SYSTEM_DISABLED_MSG });
  });

  router.get('/cameras/settings', (req, res) => {
    res.json({ settings: registry.settings() });
  });

  router.put('/cameras/settings', (req, res) => {
    const patch = req.body || {};
    const next = registry.updateSettings({
      camerasEnabled: patch.camerasEnabled,
      discoverTimeoutMs: patch.discoverTimeoutMs,
      defaultUsername: patch.defaultUsername,
      defaultPassword: patch.defaultPassword,
      autoAddDiscovered: patch.autoAddDiscovered,
      autoProbeOnDiscover: patch.autoProbeOnDiscover,
      preferSubstream: patch.preferSubstream,
      rtspPort: patch.rtspPort,
      rtspReachabilityCheckEnabled: patch.rtspReachabilityCheckEnabled,
      rtspReachabilityTimeoutMs: patch.rtspReachabilityTimeoutMs,
      rtspReachabilityCacheMs: patch.rtspReachabilityCacheMs,
      onvifPort: patch.onvifPort,
      mjpegIntervalMs: patch.mjpegIntervalMs,
      go2rtcEnabled: patch.go2rtcEnabled,
      go2rtcPort: patch.go2rtcPort,
      streamBackend: patch.streamBackend,
      snapshotArchiveEnabled: patch.snapshotArchiveEnabled,
      snapshotIntervalMs: patch.snapshotIntervalMs,
      snapshotRetentionDays: patch.snapshotRetentionDays,
      gridfsMirrorAssets: patch.gridfsMirrorAssets,
      cameraAiEnabled: patch.cameraAiEnabled,
      cameraAiBackend: patch.cameraAiBackend,
      cameraAiHttpUrl: patch.cameraAiHttpUrl,
      cameraAiModelId: patch.cameraAiModelId,
      cameraAiTimeoutMs: patch.cameraAiTimeoutMs,
      cameraAiPostCaptureEnabled: patch.cameraAiPostCaptureEnabled,
      cameraAiLiveEnabled: patch.cameraAiLiveEnabled,
      cameraAiLiveIntervalMs: patch.cameraAiLiveIntervalMs,
      cameraAiMotionEnabled: patch.cameraAiMotionEnabled,
      cameraAiMotionCooldownMs: patch.cameraAiMotionCooldownMs,
      cameraAiAlarmThreshold: patch.cameraAiAlarmThreshold,
      cameraAiAlarmTagId: patch.cameraAiAlarmTagId,
      cameraAiAssetPrefix: patch.cameraAiAssetPrefix,
      cameraTagBridgeEnabled: patch.cameraTagBridgeEnabled,
      cameraTagBridgeIntervalMs: patch.cameraTagBridgeIntervalMs,
    });
    if (patch.camerasEnabled != null) {
      if (next.camerasEnabled === false) {
        stopCameraSystem().catch(() => {});
      } else {
        startCameraSystem(next).catch(() => {});
      }
    } else if (patch.go2rtcEnabled != null) {
      if (next.camerasEnabled !== false) {
        if (next.go2rtcEnabled !== false) {
          go2rtc.start(next).then(() => go2rtc.syncAllFromRegistry(registry, next)).catch(() => {});
        } else {
          go2rtc.stop().catch(() => {});
        }
      }
    }
    if (patch.snapshotArchiveEnabled != null || patch.snapshotIntervalMs != null) {
      if (next.camerasEnabled !== false) {
        if (next.snapshotArchiveEnabled) cameraScheduler.start();
        else cameraScheduler.stop();
      }
    }
    if (
      patch.cameraAiEnabled != null
      || patch.cameraAiLiveEnabled != null
      || patch.cameraAiMotionEnabled != null
      || patch.cameraAiLiveIntervalMs != null
    ) {
      if (next.camerasEnabled !== false) restartCameraAiServices(next);
    }
    if (patch.cameraTagBridgeEnabled != null || patch.cameraTagBridgeIntervalMs != null) {
      if (next.camerasEnabled !== false) {
        if (next.cameraTagBridgeEnabled !== false) cameraTagBridge.start();
        else cameraTagBridge.stop();
      }
    }
    res.json({ settings: next });
  });

  router.get('/cameras', (req, res) => {
    res.json({
      cameras: registry.listCameras(),
      settings: registry.settings(),
    });
  });

  router.post('/cameras/discover', async (req, res) => {
    const body = req.body || {};
    const settings = registry.settings();
    const timeoutMs = Number(body.timeoutMs) || settings.discoverTimeoutMs || 4000;
    const autoAdd = body.autoAdd != null ? !!body.autoAdd : !!settings.autoAddDiscovered;
    const autoProbe = body.autoProbe != null ? !!body.autoProbe : settings.autoProbeOnDiscover !== false;

    try {
      const subnetSweep = body.subnetSweep !== false;
      const sweepOpts = {
        connectTimeoutMs: Number(body.sweepConnectMs) || 350,
        concurrency: Number(body.sweepConcurrency) || 48,
        ports: resolveSweepPorts(settings, body),
      };
      const sweepTimeoutMs = Math.max(
        timeoutMs,
        Number(body.sweepTimeoutMs) || estimateSweepTimeoutMs(sweepOpts),
      );
      let sweepTimedOut = false;
      const sweepPromise = subnetSweep
        ? discoverOnvifSubnet(sweepOpts)
        : Promise.resolve([]);
      const sweepWithCap = subnetSweep
        ? Promise.race([
          sweepPromise,
          new Promise((resolve) => {
            setTimeout(() => {
              sweepTimedOut = true;
              resolve([]);
            }, sweepTimeoutMs);
          }),
        ])
        : Promise.resolve([]);
      const [wsHits, sweepHits] = await Promise.all([
        discoverOnvif({ timeoutMs }),
        sweepWithCap,
      ]);
      // Cameras that answered on a native/RTSP port but expose no ONVIF endpoint.
      // Surface them to the user, but don't create un-probeable camera records.
      const needsSetup = sweepHits.filter((h) => h && h.needsSetup);
      const sweepOnvifHits = sweepHits.filter((h) => h && !h.needsSetup);
      let discovered = dedupeHits([...wsHits, ...sweepOnvifHits]);
      discovered = expandDiscoveryHits(discovered).map((hit) => ({
        ...hit,
        vendor: isReolinkHit(hit) ? 'reolink' : (hit.vendor || ''),
        username: body.username || settings.defaultUsername || '',
        password: body.password || settings.defaultPassword || '',
      }));
      const merge = registry.mergeDiscovered(discovered, { autoAdd });
      let probed = [];
      if (autoProbe) {
        const idsToProbe = body.probeAll === true
          ? registry.listCameraRecords().map((rec) => rec.cameraId)
          : [
            ...(merge.added || []).map((c) => c.cameraId),
            ...(merge.updated || []).map((c) => c.cameraId),
          ];
        if (idsToProbe.length) {
          const probeResult = await probeCameraIds(idsToProbe, body);
          probed = probeResult.probed || [];
        }
      }
      res.json({
        discovered,
        needsSetup,
        wsDiscoveryCount: wsHits.length,
        subnetSweepCount: sweepOnvifHits.length,
        needsSetupCount: needsSetup.length,
        subnetSweep,
        sweepTimedOut: subnetSweep ? sweepTimedOut : false,
        sweepTimeoutMs: subnetSweep ? sweepTimeoutMs : 0,
        added: merge.added,
        updated: merge.updated,
        skipped: merge.skipped,
        probed,
        settings: registry.settings(),
        cameras: registry.listCameras(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cameras/add-by-ip', async (req, res) => {
    const body = req.body || {};
    const host = String(body.host || body.ip || '').trim();
    if (!host) return res.status(400).json({ error: 'host (IP address) is required' });
    const settings = registry.settings();
    try {
      let rec = registry.listCameraRecords().find((c) => String(c.host || '').trim() === host);
      let created = false;
      if (!rec) {
        const summary = registry.createCamera({
          host,
          name: body.name || `Camera ${host}`,
          port: Number(body.port) || settings.onvifPort || 8000,
          username: body.username || settings.defaultUsername || '',
          password: body.password || settings.defaultPassword || '',
          vendor: body.vendor || 'reolink',
        });
        rec = registry.getCameraRecord(summary.cameraId);
        created = true;
      }
      const { probe, camera } = await probeAndSave(rec.cameraId, {
        username: body.username,
        password: body.password,
        preferSubstream: body.preferSubstream,
        rtspPort: body.rtspPort,
      });
      res.json({
        created,
        cameraId: rec.cameraId,
        ok: !!probe.ok,
        error: probe.error || '',
        camera,
        cameras: registry.listCameras(),
        settings: registry.settings(),
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cameras/probe-all', async (req, res) => {
    try {
      const result = await probeAllCameras(req.body || {});
      res.json({ ...result, cameras: registry.listCameras() });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/go2rtc/status', async (req, res) => {
    const settings = registry.settings();
    const running = await go2rtc.isRunning(settings);
    res.json({
      ...go2rtc.status(settings),
      running,
      enabled: !!settings.go2rtcEnabled,
      streamBackend: settings.streamBackend || 'go2rtc',
    });
  });

  router.post('/cameras/go2rtc/sync', async (req, res) => {
    const settings = registry.settings();
    try {
      const result = await go2rtc.syncAllFromRegistry(registry, settings);
      res.json({ ...result, status: go2rtc.status(settings) });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/ai/status', (req, res) => {
    const settings = registry.settings();
    res.json({
      enabled: cameraInference.aiEnabled(settings),
      backend: settings.cameraAiBackend || 'stub',
      httpUrl: settings.cameraAiHttpUrl ? '(configured)' : '',
      modelId: settings.cameraAiModelId || 'camera-vision',
      postCapture: settings.cameraAiPostCaptureEnabled !== false,
      live: cameraLiveSampler.status(),
      motion: cameraMotionMonitor.status(),
      alarmThreshold: Number(settings.cameraAiAlarmThreshold) || 0.85,
      alarmTagId: settings.cameraAiAlarmTagId || '',
    });
  });

  router.post('/cameras/ai/refresh', (req, res) => {
    const settings = registry.settings();
    restartCameraAiServices(settings);
    res.json({
      ok: true,
      live: cameraLiveSampler.status(),
      motion: cameraMotionMonitor.status(),
    });
  });

  router.get('/cameras/overview', async (req, res) => {
    const settings = registry.settings();
    const list = registry.listCameras();
    const probedOk = list.filter((c) => c.probeStatus === 'ok').length;
    const probedErr = list.filter((c) => c.probeStatus === 'error').length;
    let gfs = { connected: false, snapshotCount: 0 };
    try {
      const gfsStatus = await gridfs.status();
      gfs.connected = !!gfsStatus.connected;
      if (gfs.connected) {
        const db = await mongoTagLogger.getDb();
        if (db) {
          gfs.snapshotCount = await db.collection(`${gridfs.BUCKETS.camera_snapshots}.files`).countDocuments().catch(() => 0);
        }
      }
    } catch { /* ignore */ }
    let go2rtcRunning = false;
    try {
      go2rtcRunning = await go2rtc.isRunning(settings);
    } catch { /* ignore */ }
    res.json({
      camerasEnabled: settings.camerasEnabled !== false,
      cameras: {
        total: list.length,
        probedOk,
        probedErr,
        pending: list.length - probedOk - probedErr,
      },
      go2rtc: {
        ...go2rtc.status(settings),
        running: go2rtcRunning,
        enabled: settings.go2rtcEnabled !== false,
      },
      gridfs: gfs,
      ai: {
        enabled: cameraInference.aiEnabled(settings),
        backend: settings.cameraAiBackend || 'stub',
        live: cameraLiveSampler.status(),
        motion: cameraMotionMonitor.status(),
        alarmTagId: settings.cameraAiAlarmTagId || '',
        alarmThreshold: Number(settings.cameraAiAlarmThreshold) || 0.85,
      },
      archive: cameraScheduler.status(),
      tagBridge: cameraTagBridge.status(),
      settings: {
        snapshotArchiveEnabled: settings.snapshotArchiveEnabled !== false,
        snapshotIntervalMs: Number(settings.snapshotIntervalMs) || 60000,
      },
      inventory: list.map((c) => ({
        cameraId: c.cameraId,
        name: c.name,
        host: c.host,
        probeStatus: c.probeStatus || '',
        viewerUrl: resolveViewerUrl(c, settings),
        lastSeenAt: c.lastSeenAt || null,
        hasStream: !!c.rtspUrl,
      })),
    });
  });

  router.get('/cameras/events', async (req, res) => {
    try {
      const events = await queryEvents(null, {
        limit: Number(req.query.limit) || 200,
        type: req.query.type || null,
      });
      res.json({ events });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/inferences', async (req, res) => {
    try {
      const to = Date.now();
      const from = to - (Number(req.query.hours) || 24) * 60 * 60 * 1000;
      const rows = await mongoTagLogger.queryEdgeDocs({ from, to });
      const cameraRows = rows.filter((r) => r.cameraId || r.metadata?.cameraId || String(r.assetId || '').startsWith('cam:'));
      res.json({ inferences: cameraRows, hours: Number(req.query.hours) || 24 });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.use('/go2rtc', go2rtc.createProxyMiddleware(() => registry.settings()));

  router.post('/cameras/:id/infer', async (req, res) => {
    try {
      const source = String(req.body?.source || 'manual').trim();
      let result;
      if (source === 'live') {
        result = await cameraInference.inferLiveCamera(req.params.id);
      } else {
        const shot = await snapshotService.captureAndStore(req.params.id, { reason: 'manual_infer' });
        result = await cameraInference.inferAfterCapture(shot, 'manual');
      }
      res.json({ result });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/:id/inferences', async (req, res) => {
    try {
      const to = Date.now();
      const from = to - (Number(req.query.hours) || 24) * 60 * 60 * 1000;
      const rows = await mongoTagLogger.queryEdgeDocs({
        from,
        to,
        cameraId: req.params.id,
      });
      res.json({ cameraId: req.params.id, inferences: rows });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/:id/viewer', async (req, res) => {
    const camera = registry.getCamera(req.params.id);
    if (!camera) return res.status(404).json({ error: 'Camera not found' });
    const rec = registry.getCameraRecord(req.params.id);
    const settings = registry.settings();
    let latestSnapshot = null;
    let latestInference = null;
    try {
      latestSnapshot = await snapshotService.latestSnapshot(req.params.id);
    } catch { /* ignore */ }
    try {
      const to = Date.now();
      const from = to - 3600000;
      const rows = await mongoTagLogger.queryEdgeDocs({ from, to, cameraId: req.params.id });
      latestInference = rows.length ? rows[rows.length - 1] : null;
    } catch { /* ignore */ }
    res.json({
      cameraId: camera.cameraId,
      name: camera.name,
      viewerUrl: resolveViewerUrl(rec, settings),
      overlays: overlaysForCamera(rec),
      latestInference: latestInference ? {
        score: latestInference.inference?.score ?? latestInference.score,
        label: latestInference.inference?.label ?? latestInference.label,
        boxes: latestInference.inference?.boxes ?? latestInference.features?.boxes ?? [],
        at: latestInference.at || latestInference.timestamp,
      } : null,
      latestSnapshotUrl: latestSnapshot
        ? `/api/cameras/${encodeURIComponent(camera.cameraId)}/snapshots/${latestSnapshot.fileId}`
        : null,
      latestSnapshot,
    });
  });

  router.get('/cameras/:id/overlays', (req, res) => {
    const rec = registry.getCameraRecord(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Camera not found' });
    res.json({ cameraId: rec.cameraId, overlays: overlaysForCamera(rec) });
  });

  router.put('/cameras/:id/overlays', (req, res) => {
    const id = req.params.id;
    const existing = registry.getCameraRecord(id);
    if (!existing) return res.status(404).json({ error: 'Camera not found' });
    const overlays = normalizeOverlays(req.body?.overlays || []);
    const camera = registry.updateCamera(id, { overlays });
    cameraTagBridge.resetState();
    if (registry.settings().cameraTagBridgeEnabled !== false) cameraTagBridge.start();
    res.json({ camera, overlays });
  });

  router.post('/cameras/:id/snapshot', async (req, res) => {
    try {
      const shot = await snapshotService.captureAndStore(req.params.id, {
        reason: req.body?.reason || 'manual',
        tagId: req.body?.tagId || null,
      });
      res.status(201).json({ snapshot: shot });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/:id/snapshots', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const snapshots = await snapshotService.listSnapshots(req.params.id, { limit });
      res.json({ cameraId: req.params.id, snapshots });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/:id/snapshots/latest', async (req, res) => {
    try {
      const latest = await snapshotService.latestSnapshot(req.params.id);
      if (!latest) return res.status(404).json({ error: 'No snapshots archived' });
      if (req.query.meta === '1' || req.query.meta === 'true') {
        return res.json({ snapshot: latest });
      }
      await snapshotService.streamSnapshot(latest.fileId, res);
    } catch (e) {
      if (!res.headersSent) res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/:id/snapshots/:fileId', async (req, res) => {
    try {
      await snapshotService.streamSnapshot(req.params.fileId, res);
    } catch (e) {
      if (!res.headersSent) res.status(e.status || 404).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/:id/events', async (req, res) => {
    try {
      const events = await queryEvents(req.params.id, {
        limit: Number(req.query.limit) || 100,
        type: req.query.type || null,
      });
      res.json({ cameraId: req.params.id, events });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/:id/player', async (req, res) => {
    const rec = registry.getCameraRecord(req.params.id);
    if (!rec) return res.status(404).send('Camera not found');
    const settings = registry.settings();
    if (!settings.go2rtcEnabled) {
      return res.redirect(`/api/cameras/${encodeURIComponent(req.params.id)}/mjpeg`);
    }
    if (!rec.rtspUrl) {
      const probeHint = rec.probeStatus === 'error' && rec.probeError
        ? `Probe failed: ${rec.probeError}`
        : 'Camera has no RTSP URL — run Probe first.';
      return res.status(400).type('html').send(renderPlayerSetupHtml(req.params.id, probeHint));
    }
    try {
      await go2rtc.syncCamera(req.params.id, rec.rtspUrl, settings, rec);
      res.type('html').send(renderPlayerHtml(req.params.id, { proxyBase: '/api/go2rtc' }));
    } catch (e) {
      const status = e.status || (e.skipped ? 503 : 502);
      res.status(status).send(`go2rtc error: ${e.message || String(e)}`);
    }
  });

  router.get('/cameras/:id/mjpeg', async (req, res) => {
    const rec = registry.getCameraRecord(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Camera not found' });
    const settings = registry.settings();
    try {
      await streamCameraMjpeg(rec, res, {
        intervalMs: settings.mjpegIntervalMs || 200,
        req,
      });
    } catch (e) {
      if (!res.headersSent) {
        res.status(e.status || 500).json({ error: e.message || String(e) });
      }
    }
  });

  router.post('/cameras/:id/probe', async (req, res) => {
    try {
      const result = await probeAndSave(req.params.id, req.body || {});
      if (result.status === 404) return res.status(404).json({ error: result.error });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cameras/:id', (req, res) => {
    const rec = registry.getCameraRecord(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Camera not found' });
    const camera = registry.getCamera(req.params.id, { redact: false });
    res.json({ camera: { ...camera, overlays: overlaysForCamera(rec) } });
  });

  router.post('/cameras', (req, res) => {
    try {
      const camera = registry.createCamera(req.body || {});
      res.status(201).json({ camera });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.put('/cameras/:id', (req, res) => {
    try {
      const camera = registry.updateCamera(req.params.id, req.body || {});
      if (!camera) return res.status(404).json({ error: 'Camera not found' });
      res.json({ camera });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.delete('/cameras/:id', async (req, res) => {
    const settings = registry.settings();
    const ok = registry.deleteCamera(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Camera not found' });
    await go2rtc.removeCamera(req.params.id, settings).catch(() => {});
    cameraMotionMonitor.stopCamera(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = {
  createCameraRoutes,
  probeAndSave,
  probeCameraIds,
  probeAllCameras,
  resolveSweepPorts,
};

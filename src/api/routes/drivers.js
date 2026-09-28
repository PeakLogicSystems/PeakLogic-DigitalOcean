'use strict';

const fs = require('fs');
const path = require('path');
const persistence = require('../../persistence');
const { ST_DIR } = require('../../config');
const programStore = require('../../programs/programStore');
const { listPresets, buildFromPreset, getPreset } = require('../../devices/devicePresets');
const { nextSlaveId, offsetTagsForDriver, concubeApplyOptions } = require('../../devices/applyPresetUtils');
const { MAX_TAGS, DEFAULT_MQTT_PARC_BROKER } = require('../../config');
const { sanitizeDriverConfig, mergeDriverSecrets, isBlankSecret, publicDriverList } = require('../../drivers/driverConfig');
const { bootstrapMqttParc } = require('../../parc/mqttParcBootstrap');
const { patchWorkspaceDrivers, patchActiveProjectDrivers } = require('../../project/estFile');
const { resolveParcRegistry } = require('../../parc/deviceRegistry');
const {
  bindTemplateDriverToRegistry,
} = require('../../parc/parcDriverSync');

async function persistDrivers(deps, drivers) {
  const { driverManager, scanEngine } = deps;
  driverManager.save(drivers);
  patchWorkspaceDrivers(drivers);
  try {
    await patchActiveProjectDrivers(drivers);
  } catch (e) {
    console.warn('[drivers] patch project snapshot:', e.message || e);
  }
  await persistence.flushConfig();
  await driverManager.rebuild();
  if (scanEngine) scanEngine.loadSettings();
}
const { resolveCredentials, loginNextcentury } = require('../../drivers/nextcenturyAuth');
const { createPortalSession } = require('../../drivers/nextcenturyPortalSession');
const {
  estimateNextcenturyDeploy,
  estimateFromDriverInstance,
} = require('../../drivers/nextcenturyDeployEstimate');

function createDriverRoutes(deps) {
  const { tagStore, driverManager, scanEngine } = deps;
  const router = require('express').Router();

  router.get('/drivers', (req, res) => {
    res.json({
      drivers: publicDriverList(driverManager.list()),
      health: driverManager.health(),
    });
  });

  router.put('/drivers/nextcentury/setup', async (req, res) => {
    try {
      const body = req.body || {};
      const driverId = String(body.id || body.driverId || 'nextcentury1').trim() || 'nextcentury1';
      const list = driverManager.list();
      const prev = list.find((d) => d.id === driverId && d.type === 'nextcentury')
        || list.find((d) => d.type === 'nextcentury');
      const propertyIds = body.propertyIds != null
        ? (Array.isArray(body.propertyIds)
          ? body.propertyIds
          : String(body.propertyIds).split(/[,\s]+/).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n)))
        : prev?.propertyIds;
      const incoming = sanitizeDriverConfig({
        ...(prev || { id: driverId, type: 'nextcentury', enabled: true }),
        id: driverId,
        type: 'nextcentury',
        enabled: body.enabled !== false,
        email: body.email != null ? String(body.email).trim() : (prev?.email || ''),
        password: body.password != null ? String(body.password) : (prev?.password || ''),
        reportId: body.reportId != null ? String(body.reportId).trim() : (prev?.reportId || 'rt_4510'),
        pollIntervalMs: body.pollIntervalMs != null ? Number(body.pollIntervalMs) : prev?.pollIntervalMs,
        propertyIds,
        propertyDelayMs: body.propertyDelayMs != null ? Number(body.propertyDelayMs) : (prev?.propertyDelayMs || 600),
        autoSyncTags: body.autoSyncTags != null ? body.autoSyncTags !== false : prev?.autoSyncTags !== false,
        devicesPerSite: body.devicesPerSite != null ? Number(body.devicesPerSite) : prev?.devicesPerSite,
        timeoutMs: body.timeoutMs != null ? Number(body.timeoutMs) : (prev?.timeoutMs || 20000),
      });
      const merged = mergeDriverSecrets([incoming], list)[0];
      const drivers = prev
        ? list.map((d) => (d.id === merged.id ? merged : d))
        : [...list, merged];
      const passwordUpdated = !isBlankSecret(body.password);
      await persistDrivers({ driverManager, scanEngine }, drivers);
      if (body.connect) {
        await driverManager.connectDriver(merged.id);
      }
      res.json({
        ok: true,
        driverId: merged.id,
        hasPassword: Boolean(merged.password),
        passwordUpdated,
        email: merged.email || '',
        drivers: publicDriverList(driverManager.list()),
        health: driverManager.health(),
      });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e) });
    }
  });

  router.put('/drivers', async (req, res) => {
    const drivers = mergeDriverSecrets(
      [...(req.body.drivers || [])].map(sanitizeDriverConfig),
      driverManager.list(),
    );
    const warnings = [];
    const rtuPorts = new Map();
    for (const d of drivers) {
      if (d.type === 'modbus_rtu' && d.enabled !== false && d.serialPort) {
        const port = String(d.serialPort).toUpperCase();
        if (rtuPorts.has(port)) {
          d.enabled = false;
          warnings.push(
            `Disabled duplicate driver "${d.id}" — ${port} is already used by "${rtuPorts.get(port)}"`
          );
        } else {
          rtuPorts.set(port, d.id);
        }
      }
      if (d.type === 'vgreen_epc' && d.enabled !== false && d.serialPort) {
        const port = String(d.serialPort).toUpperCase();
        if (rtuPorts.has(port)) {
          d.enabled = false;
          warnings.push(
            `Disabled duplicate driver "${d.id}" — ${port} is already used by "${rtuPorts.get(port)}"`
          );
        } else {
          rtuPorts.set(port, d.id);
        }
      }
    }
    driverManager.save(drivers);
    patchWorkspaceDrivers(drivers);
    patchActiveProjectDrivers(drivers).catch((e) => {
      console.warn('[drivers] patch project snapshot:', e.message || e);
    });
    await persistence.flushConfig();
    const hasRemoteOpta = drivers.some(
      (d) => (d.type === 'opta_remote' || d.type === 'mqtt_parc') && d.enabled !== false
    );
    let boot;
    if (hasRemoteOpta) {
      boot = await bootstrapMqttParc({ drivers, driverManager, tagStore });
      if (boot.changed) {
        if (scanEngine) scanEngine.loadSettings();
      }
      if (boot.hub?.started) {
        console.log('[mqtt-parc] hub connected (driver save)');
      } else if (boot.hub?.error) {
        console.warn('[mqtt-parc] hub start:', boot.hub.error);
      }
    }
    await driverManager.rebuild();
    if (hasRemoteOpta && boot?.hub?.started) {
      await driverManager.linkMqttParcDriversIfHubLive();
    }
    res.json({ ok: true, warnings, health: driverManager.health(), drivers: publicDriverList(driverManager.list()) });
  });

  router.post('/drivers/test', async (req, res) => {
    try {
      const cfg = mergeDriverSecrets(
        [sanitizeDriverConfig(req.body)],
        driverManager.list(),
      )[0];
      res.json({ result: await driverManager.testConnection(cfg) });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e) });
    }
  });

  router.post('/drivers/connect', async (req, res) => {
    const id = req.body?.driverId;
    if (!id) return res.status(400).json({ error: 'driverId required' });
    try {
      const ok = await driverManager.connectDriver(id);
      if (!ok) {
        const row = driverManager.health().find((h) => h.id === id);
        return res.status(400).json({
          error: row?.message || 'Connection failed',
          health: driverManager.health(),
        });
      }
      res.json({ ok: true, health: driverManager.health() });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e), health: driverManager.health() });
    }
  });

  router.post('/drivers/disconnect', async (req, res) => {
    const id = req.body?.driverId;
    if (!id) return res.status(400).json({ error: 'driverId required' });
    try {
      await driverManager.disconnectDriver(id);
      res.json({ ok: true, health: driverManager.health() });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e), health: driverManager.health() });
    }
  });

  router.get('/devices/presets', (req, res) => {
    res.json({ presets: listPresets() });
  });

  router.post('/devices/apply', async (req, res) => {
    const replaceTags = req.body.replaceTags === true;
    const presetMeta = getPreset(req.body.presetId);
    if (!presetMeta) {
      return res.status(404).json({ error: `Unknown device preset: ${req.body.presetId}` });
    }
    const tagList = tagStore.list();
    const driverList = driverManager.list();
    const targetDriverId = req.body.driverId || presetMeta.driver({}).id;
    const buildOpts = {
      driverId: req.body.driverId,
      serialPort: req.body.serialPort,
      host: req.body.host,
      port: req.body.port != null ? +req.body.port : undefined,
      baud: req.body.baud != null ? +req.body.baud : undefined,
      slaveId: req.body.slaveId != null ? +req.body.slaveId : undefined,
      parity: req.body.parity,
      stopBits: req.body.stopBits != null ? +req.body.stopBits : undefined,
      brokerUrl: req.body.brokerUrl,
      serialNum: req.body.serialNum,
      clientId: req.body.clientId,
      username: req.body.username,
      password: req.body.password,
      deviceId: req.body.deviceId,
      topicPrefix: req.body.topicPrefix,
    };
    if (presetMeta.concube) {
      const cubeOpts = concubeApplyOptions(
        presetMeta,
        tagList,
        targetDriverId,
        replaceTags,
        req.body.paramGroups,
      );
      if (cubeOpts.error) {
        return res.status(400).json({ error: cubeOpts.error });
      }
      Object.assign(buildOpts, cubeOpts);
    }
    const built = buildFromPreset(req.body.presetId, buildOpts);
    if (built.driver?.type === 'mqtt_parc') {
      built.driver = bindTemplateDriverToRegistry(built.driver, resolveParcRegistry(), driverList);
    }
    const driverIdx = driverList.findIndex((d) => d.id === built.driver.id);
    const driverExists = driverIdx >= 0;
    const driverListOut = driverExists
      ? driverList.map((d, i) => (i === driverIdx ? built.driver : d))
      : [...driverList, built.driver];
    driverManager.save(driverListOut);

    const sharedBus = presetMeta.sharedBus !== false;
    let templateTags = presetMeta.tagsFromDevice ? [] : built.tags;
    let assignedSlave = built.driver.slaveId ?? 1;
    if (!replaceTags) {
      const fallback = req.body.slaveId != null ? +req.body.slaveId : (built.driver.slaveId ?? 1);
      assignedSlave = sharedBus
        ? nextSlaveId(driverList, tagList, built.driver, fallback)
        : fallback;
      templateTags = offsetTagsForDriver(built.tags, built.driver.id, tagList, assignedSlave);
    }

    let merged;
    if (driverExists && !replaceTags) {
      const existingIds = new Set(tagList.map((t) => t.id));
      const conflicts = templateTags.filter((t) => existingIds.has(t.id));
      if (conflicts.length) {
        return res.status(409).json({
          error: `Tag id already in use: ${conflicts.map((t) => t.id).join(', ')}`,
        });
      }
      merged = [...tagList, ...templateTags];
    } else {
      const stripped = tagList.filter((t) => t.driverId !== built.driver.id);
      merged = [...stripped, ...templateTags];
    }
    if (merged.length > MAX_TAGS) {
      return res.status(413).json({ error: `Tag limit ${MAX_TAGS} exceeded (${merged.length})` });
    }
    tagStore.replaceAll(merged);
    if (built.driver?.type === 'opta_remote' || built.driver?.type === 'mqtt_parc') {
      const settings = persistence.readJson('settings.json', {});
      settings.remoteExecution = true;
      persistence.writeJson('settings.json', settings);
    }
    // The device's ST program "lives in" the device: activate it so the runtime
    // deploys it (locally, or to the remote Opta) and exposes its tags.
    let activeProgram;
    const stProgram = built.stProgram || presetMeta.stProgram || presetMeta.defaultProgram;
    if (stProgram && programStore.programExists(stProgram)) {
      activeProgram = programStore.setActive(stProgram);
    }
    const hasRemoteOpta = driverListOut.some(
      (d) => (d.type === 'mqtt_parc' || d.type === 'opta_remote') && d.enabled !== false,
    );
    let boot;
    let registryDriversAdded = [];
    if (hasRemoteOpta) {
      boot = await bootstrapMqttParc({
        drivers: driverListOut,
        driverManager,
        tagStore,
        syncRegistryTags: presetMeta.tagsFromDevice === true,
      });
      registryDriversAdded = boot.registryLinked?.added || [];
      if (boot.registryLinked?.changed) {
        driverListOut = boot.registryLinked.drivers || driverManager.list();
      }
      if (boot.changed && scanEngine) scanEngine.loadSettings();
    }
    void driverManager.rebuild()
      .then(async () => {
        if (hasRemoteOpta && boot?.hub?.started && typeof driverManager.linkMqttParcDriversIfHubLive === 'function') {
          await driverManager.linkMqttParcDriversIfHubLive();
        }
      })
      .catch((e) => {
        console.warn('[devices/apply] rebuild:', e.message || String(e));
      });
    if (scanEngine) {
      scanEngine.loadSettings();
      if (activeProgram && typeof scanEngine.loadProgram === 'function') {
        try {
          scanEngine.loadProgram();
        } catch (e) {
          console.warn('[devices/apply] loadProgram:', e.message || String(e));
        }
      }
    }
    res.json({
      ok: true,
      preset: built.preset,
      driver: built.driver,
      tagsAdded: templateTags.length,
      tagCount: tagStore.count(),
      merged: driverExists && !replaceTags,
      slaveId: assignedSlave,
      tagsFromDevice: !!presetMeta.tagsFromDevice,
      activeProgram: activeProgram || undefined,
      nextStep: presetMeta.tagsFromDevice
        ? 'Parc registry devices are linked as drivers automatically. Sync tags or Download & Start the on-device ST program.'
        : undefined,
      registryDriversAdded: registryDriversAdded,
    });
  });

  router.get('/drivers/nextcentury/example', (req, res) => {
    const fp = path.join(ST_DIR, 'fixtures', 'nextcentury.setup.example.json');
    if (!fs.existsSync(fp)) {
      return res.status(404).json({ error: 'NextCentury example setup not found' });
    }
    try {
      const example = JSON.parse(fs.readFileSync(fp, 'utf8'));
      res.json(example);
    } catch (e) {
      res.status(500).json({ error: e.message || 'Failed to read example setup' });
    }
  });

  router.post('/drivers/nextcentury/portal-session', async (req, res) => {
    const body = req.body || {};
    const driverId = String(body.driverId || '').trim();
    let cfg = null;
    if (driverId) {
      cfg = driverManager.list().find((d) => d.id === driverId && d.type === 'nextcentury');
      if (!cfg) {
        return res.status(404).json({ error: `NextCentury driver not found: ${driverId}` });
      }
    } else {
      cfg = sanitizeDriverConfig({
        type: 'nextcentury',
        email: body.email,
        password: body.password,
      });
    }
    try {
      const auth = await loginNextcentury(
        resolveCredentials(cfg),
        cfg.timeoutMs || 15000,
      );
      const session = createPortalSession({
        token: auth.token,
        email: auth.email,
        driverId: driverId || cfg.id || '',
      });
      res.json({
        ok: true,
        sessionId: session.sessionId,
        email: auth.email,
        driverId: driverId || cfg.id || '',
        framePath: `/nextcentury-portal/frame/${session.sessionId}`,
        portalPath: `/nextcentury-portal/${session.sessionId}`,
        expiresAt: session.expiresAt,
        note: 'API JWT handoff — portal may still prompt for login if the web app does not accept token URLs.',
      });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e) });
    }
  });

  router.post('/drivers/nextcentury/load-example-tags', async (req, res) => {
    const driverId = String(req.body?.driverId || 'nextcentury1').trim();
    if (!driverId) return res.status(400).json({ error: 'driverId required' });
    const fp = path.join(ST_DIR, 'fixtures', 'tags.nextcentury.json');
    if (!fs.existsSync(fp)) {
      return res.status(404).json({ error: 'tags.nextcentury.json fixture not found' });
    }
    let fixtureTags;
    try {
      fixtureTags = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Failed to read tags fixture' });
    }
    if (!Array.isArray(fixtureTags)) {
      return res.status(500).json({ error: 'Invalid tags fixture' });
    }
    const merge = req.body?.merge !== false;
    const remapped = fixtureTags.map((t) => ({ ...t, driverId }));
    const tagList = tagStore.list();
    let merged;
    if (merge) {
      const stripped = tagList.filter((t) => t.driverId !== driverId);
      const existingIds = new Set(stripped.map((t) => t.id));
      const conflicts = remapped.filter((t) => existingIds.has(t.id));
      if (conflicts.length) {
        return res.status(409).json({
          error: `Tag id already in use: ${conflicts.map((t) => t.id).join(', ')}`,
        });
      }
      merged = [...stripped, ...remapped];
    } else {
      merged = [...tagList.filter((t) => t.driverId !== driverId), ...remapped];
    }
    if (merged.length > MAX_TAGS) {
      return res.status(413).json({ error: `Tag limit ${MAX_TAGS} exceeded (${merged.length})` });
    }
    tagStore.replaceAll(merged);
    await driverManager.rebuild();
    if (scanEngine) scanEngine.loadSettings();
    res.json({
      ok: true,
      driverId,
      tagsAdded: remapped.length,
      tagCount: tagStore.count(),
      merged,
    });
  });

  router.post('/drivers/nextcentury/deploy-estimate', (req, res) => {
    const body = req.body || {};
    const driverId = String(body.driverId || body.id || '').trim();
    let cfg = null;
    if (driverId) {
      cfg = driverManager.list().find((d) => d.id === driverId && d.type === 'nextcentury');
    }
    if (!cfg && body.driver && body.driver.type === 'nextcentury') {
      cfg = sanitizeDriverConfig(body.driver);
    }
    if (!cfg) {
      cfg = sanitizeDriverConfig({
        type: 'nextcentury',
        pollIntervalMs: body.pollIntervalMs,
        propertyIds: body.propertyIds,
        propertyDelayMs: body.propertyDelayMs,
        autoSyncTags: body.autoSyncTags,
        devicesPerSite: body.devicesPerSite,
      });
    } else {
      cfg = {
        ...cfg,
        pollIntervalMs: body.pollIntervalMs ?? cfg.pollIntervalMs,
        propertyIds: body.propertyIds ?? cfg.propertyIds,
        propertyDelayMs: body.propertyDelayMs ?? cfg.propertyDelayMs,
        autoSyncTags: body.autoSyncTags ?? cfg.autoSyncTags,
        devicesPerSite: body.devicesPerSite ?? cfg.devicesPerSite,
      };
    }

    const settings = persistence.readJson('settings.json', {});
    const opts = {
      scanMs: settings.scanMs,
      maxTags: MAX_TAGS,
      devicesPerSite: body.devicesPerSite,
      siteCount: body.siteCount,
      tagsPerDevice: body.tagsPerDevice,
      apiLatencyMs: body.apiLatencyMs,
      manualTagCount: body.manualTagCount,
    };
    if (body.useLive !== false && driverId) {
      const instance = driverManager.instances?.get(driverId);
      const est = instance?.deployEstimate
        ? instance.deployEstimate(opts)
        : estimateFromDriverInstance(cfg, instance, opts);
      return res.json({
        ...est,
        driverId: driverId || cfg.id || '',
        deploymentMode: est.deploymentMode,
      });
    }
    res.json({
      ...estimateNextcenturyDeploy(cfg, opts),
      driverId: driverId || cfg.id || '',
    });
  });

  router.post('/drivers/parc-opta/bulk', async (req, res) => {
    const body = req.body || {};
    const parcRegistry = resolveParcRegistry();
    const { mergeParcTagsIntoStore } = require('../../parc/parcTagSync');
    const { bulkAddParcOptaDrivers } = require('../../devices/bulkAddParcOpta');
    const hardwareHistoryStore = require('../../hardware/hardwareHistoryStore');

    let result;
    try {
      result = bulkAddParcOptaDrivers({
        driverList: driverManager.list(),
        body,
        registry: parcRegistry,
      });
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }

    if (!result.added.length) {
      return res.json({
        ok: true,
        added: [],
        addedEntries: [],
        skipped: result.skipped,
        registryFiltered: result.registryFiltered || [],
        syncResults: [],
        drivers: driverManager.list(),
      });
    }

    const drivers = result.drivers.map(sanitizeDriverConfig);
    driverManager.save(drivers);
    patchWorkspaceDrivers(drivers);

    const boot = await bootstrapMqttParc({ drivers, driverManager, tagStore });
    if (boot.changed && scanEngine) scanEngine.loadSettings();

    await driverManager.rebuild();
    if (scanEngine) scanEngine.loadSettings();

    const syncResults = [];
    if (body.syncTags !== false) {
      let tagList = tagStore.list();
      for (const entry of result.addedEntries || []) {
        const positionId = entry.positionId || entry;
        const dev = parcRegistry.getDevice(entry.deviceId || entry);
        if (!dev) {
          syncResults.push({ driverId: positionId, ok: false, error: 'no telemetry' });
          continue;
        }
        if (dev.stale) {
          syncResults.push({ driverId: positionId, ok: false, error: `stale (${dev.ageSec}s)` });
          continue;
        }
        const merged = mergeParcTagsIntoStore(tagList, dev.tags, positionId, { reassign: true });
        if (!merged.ok) {
          syncResults.push({ driverId: positionId, ok: false, error: merged.error });
          continue;
        }
        if (merged.tags.length > MAX_TAGS) {
          syncResults.push({ driverId: positionId, ok: false, error: `tag limit ${MAX_TAGS}` });
          continue;
        }
        tagList = merged.tags;
        syncResults.push({ driverId: positionId, ok: true, tagsReplaced: merged.count });
      }
      if (syncResults.some((s) => s.ok)) {
        tagStore.replaceAll(tagList);
        await driverManager.rebuild();
        if (scanEngine) scanEngine.loadSettings();
      }
    }

    for (const entry of result.addedEntries || []) {
      const positionId = entry.positionId;
      const dev = parcRegistry.getDevice(entry.deviceId);
      const drv = drivers.find((d) => d.id === positionId);
      if (!positionId || !dev || !drv) continue;
      try {
        const current = await hardwareHistoryStore.getCurrentAssignment(positionId);
        if (!current) {
          await hardwareHistoryStore.recordCommission({
            positionId,
            positionName: drv.name,
            registryDev: dev,
            driver: drv,
            note: 'commissioned via bulk add',
          });
        }
      } catch (e) {
        console.warn('[hardware-history] commission:', e.message || e);
      }
    }

    res.json({
      ok: true,
      added: result.added,
      addedEntries: result.addedEntries || [],
      skipped: result.skipped,
      registryFiltered: result.registryFiltered || [],
      syncResults,
      drivers: driverManager.list(),
    });
  });

  router.post('/drivers/parc-opta/replace-hardware', async (req, res) => {
    const positionId = String(req.body?.driverId || req.body?.positionId || '').trim();
    const newDeviceId = String(req.body?.newDeviceId || '').trim();
    if (!positionId) return res.status(400).json({ error: 'driverId (position) required' });
    if (!newDeviceId) return res.status(400).json({ error: 'newDeviceId required' });

    const parcRegistry = resolveParcRegistry();
    const { mergeParcTagsIntoStore } = require('../../parc/parcTagSync');
    const { replaceParcOptaHardware } = require('../../devices/bulkAddParcOpta');
    const hardwareHistoryStore = require('../../hardware/hardwareHistoryStore');
    const mongoSysLog = require('../../logger/mongoSysLog');

    const cfg = driverManager.list().find((d) => d.id === positionId);
    const outgoingRegistryDev = cfg ? parcRegistry.getDevice(String(cfg.deviceId || '').trim()) : null;

    let replaced;
    try {
      replaced = replaceParcOptaHardware({
        driverList: driverManager.list(),
        positionId,
        newDeviceId,
        registry: parcRegistry,
        note: req.body?.note,
        swapType: req.body?.swapType,
        vendor: req.body?.vendor,
        model: req.body?.model,
      });
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }

    const drivers = replaced.drivers.map(sanitizeDriverConfig);
    driverManager.save(drivers);
    patchWorkspaceDrivers(drivers);
    await driverManager.rebuild();

    let syncResult = null;
    if (req.body?.syncTags !== false) {
      const dev = parcRegistry.getDevice(replaced.newDeviceId);
      if (dev && !dev.stale) {
        const merged = mergeParcTagsIntoStore(tagStore.list(), dev.tags, positionId, {
          reassign: req.body?.reassign !== false,
        });
        if (merged.ok && merged.tags.length <= MAX_TAGS) {
          tagStore.replaceAll(merged.tags);
          await driverManager.rebuild();
          syncResult = { ok: true, tagsReplaced: merged.count, reassigned: merged.reassigned || 0 };
        } else if (!merged.ok) {
          syncResult = { ok: false, error: merged.error };
        } else {
          syncResult = { ok: false, error: `Tag limit ${MAX_TAGS} exceeded` };
        }
      } else {
        syncResult = { ok: false, error: dev ? `stale (${dev.ageSec}s)` : 'no telemetry' };
      }
    }

    if (scanEngine) scanEngine.loadSettings();
    const { getMqttCentralHub } = require('../../parc/mqttCentralHub');
    if (getMqttCentralHub(parcRegistry).isLive()) {
      await driverManager.linkMqttParcDriversIfHubLive();
    }

    const newCfg = drivers.find((d) => d.id === positionId);
    let historyRecord = null;
    try {
      historyRecord = await hardwareHistoryStore.recordHardwareSwap({
        positionId,
        positionName: newCfg?.name,
        outgoingDriver: cfg,
        outgoingRegistryDev,
        incomingRegistryDev: parcRegistry.getDevice(replaced.newDeviceId),
        incomingDriver: newCfg,
        swapType: req.body?.swapType,
        note: req.body?.note,
        vendor: req.body?.vendor,
        model: req.body?.model,
      });
      mongoSysLog.maintenance('hardware', 'Hardware replaced at position', {
        positionId,
        previousDeviceId: replaced.previousDeviceId,
        newDeviceId: replaced.newDeviceId,
        swapType: historyRecord?.swapType,
      }, { user: req.peaklogicUser || undefined });
    } catch (e) {
      console.warn('[hardware-history] swap:', e.message || e);
      mongoSysLog.error('hardware', 'Hardware swap record failed', { message: e.message, positionId });
    }

    res.json({
      ok: true,
      positionId: replaced.positionId,
      previousDeviceId: replaced.previousDeviceId,
      newDeviceId: replaced.newDeviceId,
      syncResult,
      historyRecord,
      drivers: driverManager.list(),
      health: driverManager.health(),
    });
  });

  router.post('/drivers/parc-opta/rename-position', async (req, res) => {
    const oldPositionId = String(req.body?.driverId || req.body?.oldPositionId || '').trim();
    const newPositionId = String(req.body?.newPositionId || '').trim();
    if (!oldPositionId || !newPositionId) {
      return res.status(400).json({ error: 'driverId and newPositionId required' });
    }

    const { renameParcOptaPosition } = require('../../devices/bulkAddParcOpta');
    let renamed;
    try {
      renamed = renameParcOptaPosition({
        driverList: driverManager.list(),
        tagList: tagStore.list(),
        oldPositionId,
        newPositionId,
      });
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }

    const drivers = renamed.drivers.map(sanitizeDriverConfig);
    driverManager.save(drivers);
    patchWorkspaceDrivers(drivers);
    tagStore.replaceAll(renamed.tags);
    await driverManager.rebuild();
    if (scanEngine) scanEngine.loadSettings();

    res.json({
      ok: true,
      oldPositionId: renamed.oldPositionId,
      newPositionId: renamed.newPositionId,
      drivers: driverManager.list(),
    });
  });

  router.post('/drivers/sync-parc-tags', async (req, res) => {
    const driverId = req.body?.driverId;
    if (!driverId) return res.status(400).json({ error: 'driverId required' });
    const cfg = driverManager.list().find((d) => d.id === driverId);
    if (!cfg || cfg.type !== 'mqtt_parc') {
      return res.status(400).json({ error: 'mqtt_parc driver required' });
    }
    const parcRegistry = resolveParcRegistry();
    const { mergeParcTagsIntoStore } = require('../../parc/parcTagSync');
    const {
      findRegistryDeviceForDriver,
      fetchOptaIoMap,
      ioMapPointsToParcTags,
      resolveOptaHost,
    } = require('../../parc/optaIoMapSync');

    const { device: dev, deviceId, resolvedId } = findRegistryDeviceForDriver(parcRegistry, cfg);
    if (!dev) {
      return res.status(404).json({
        error: `No Parc report for ${resolvedId || cfg.deviceId} — connect Opta to MQTT and scan expansions on /setup`,
      });
    }

    let parcTags = Array.isArray(dev.tags) ? dev.tags : [];
    let source = 'registry';
    const staleWarning = dev.stale
      ? `Telemetry stale for ${deviceId} (last ${dev.ageSec ?? '?'}s ago)`
      : null;

    if (parcTags.length > 0) {
      source = dev.stale ? 'registry-stale' : 'registry';
    } else {
      const host = resolveOptaHost(parcRegistry, cfg, dev);
      if (!host) {
        return res.status(404).json({
          error: `No tags in Parc registry for ${deviceId} and no Opta IP — open /setup on device or wait for telemetry`,
        });
      }
      try {
        const ioMap = await fetchOptaIoMap(host, { port: cfg.port, timeoutMs: cfg.commandTimeoutMs });
        parcTags = ioMapPointsToParcTags(ioMap.points);
        source = 'http';
      } catch (e) {
        return res.status(e.status || 502).json({
          error: e.message || String(e),
        });
      }
      if (!parcTags.length) {
        return res.status(404).json({
          error: `Opta at ${host} returned no input/output points — scan expansions on /setup`,
        });
      }
    }

    const merged = mergeParcTagsIntoStore(tagStore.list(), parcTags, driverId, {
      reassign: req.body?.reassign !== false,
    });
    if (!merged.ok) return res.status(400).json({ error: merged.error, conflicts: merged.conflicts });
    if (merged.tags.length > MAX_TAGS) {
      return res.status(413).json({ error: `Tag limit ${MAX_TAGS} exceeded (${merged.tags.length})` });
    }
    tagStore.replaceAll(merged.tags);
    await driverManager.rebuild();
    if (scanEngine) scanEngine.loadSettings();
    res.json({
      ok: true,
      driverId,
      deviceId,
      resolvedId,
      source,
      stale: !!dev.stale,
      warning: staleWarning,
      tagsReplaced: merged.count,
      reassigned: merged.reassigned || 0,
      tagCount: tagStore.count(),
      expansionModules: dev.meta?.expansionModules || [],
    });
  });

  return router;
}

module.exports = { createDriverRoutes };

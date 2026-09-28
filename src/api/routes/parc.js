'use strict';

const programStore = require('../../programs/programStore');
const mongoTagLogger = require('../../logger/mongoTagLogger');
const { resolveParcRegistry } = require('../../parc/deviceRegistry');
const { getMqttCentralHub } = require('../../parc/mqttCentralHub');
const { buildOptaProgramBody, slimPutProgramBodyForMqtt } = require('../../parc/mqttOptaProgram');
const { clientDeployMeta } = require('../../drivers/optaProtocol');
const { enrichParcDevicesWithDriverLink } = require('../../parc/parcDiscovery');

function parcReg() {
  return resolveParcRegistry();
}

function hub() {
  return getMqttCentralHub(parcReg());
}

function visibleDeviceOr404(res, deviceId) {
  const reg = parcReg();
  const device = reg.getDevice(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return null;
  }
  try {
    const { tenantCanSeeDevice } = require('../../parc/parcTenantScope');
    if (!tenantCanSeeDevice(reg, deviceId)) {
      res.status(404).json({ error: 'Device not found' });
      return null;
    }
  } catch { /* appliance */ }
  return device;
}

function createParcRoutes(deps = {}) {
  const { tagStore, driverManager } = deps;
  const router = require('express').Router();

  router.get('/parc/settings', (req, res) => {
    res.json({
      settings: parcReg().settings(),
      mqtt: hub().status(),
    });
  });

  router.put('/parc/settings', (req, res) => {
    const patch = req.body || {};
    res.json({ settings: parcReg().updateSettings(patch) });
  });

  router.get('/parc/devices', (req, res) => {
    const drivers = driverManager?.list?.() || [];
    const reg = parcReg();
    let devices = reg.listDevices();
    try {
      const { listVisibleParcDevices } = require('../../parc/parcTenantScope');
      devices = listVisibleParcDevices(reg);
    } catch { /* appliance */ }
    res.json({
      devices: enrichParcDevicesWithDriverLink(devices, drivers),
      settings: reg.settings(),
      mqtt: hub().status(),
    });
  });

  router.get('/parc/devices/:id', (req, res) => {
    const device = visibleDeviceOr404(res, req.params.id);
    if (!device) return;
    res.json({ device });
  });

  router.get('/parc/devices/:id/reporter', (req, res) => {
    if (!visibleDeviceOr404(res, req.params.id)) return;
    res.json(parcReg().reporterConfig(req.params.id));
  });

  /** Legacy HTTP ingest — prefer MQTT telemetry from edge runtime. */
  router.post('/parc/report', async (req, res) => {
    const body = req.body || {};
    mongoTagLogger.logEdgeFromReport(body).catch(() => {});
    const result = parcReg().ingestReport(body);
    if (!result.ok) return res.status(result.status || 400).json(result);
    res.json(result);
  });

  router.post('/parc/devices/:id/attach', (req, res) => {
    const existing = parcReg().getDevice(req.params.id);
    if (existing && !visibleDeviceOr404(res, req.params.id)) return;
    const body = req.body || {};
    const device = parcReg().attach(req.params.id, {
      host: body.host,
      port: body.port,
      sessionId: body.sessionId,
    });
    hub().publishDeviceConfig(req.params.id, { pauseTelemetry: true, debugAttached: true });
    res.json({
      ok: true,
      device,
      transport: 'mqtt',
      message: 'Debug attach: telemetry throttled; program device via POST /api/parc/devices/:id/cmd',
    });
  });

  router.post('/parc/devices/:id/detach', (req, res) => {
    if (!visibleDeviceOr404(res, req.params.id)) return;
    const device = parcReg().detach(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    hub().publishDeviceConfig(req.params.id, { pauseTelemetry: false, debugAttached: false });
    res.json({ ok: true, device, transport: 'mqtt' });
  });

  /** Deploy ST program to MQTT Opta ST device (parses .st → AST). */
  router.post('/parc/devices/:id/program', async (req, res) => {
    if (!visibleDeviceOr404(res, req.params.id)) return;
    if (!tagStore) return res.status(500).json({ error: 'tagStore required' });
    const source = req.body?.source ?? programStore.readActive();
    const driverId = req.body?.driverId || req.params.id;
    const built = buildOptaProgramBody(source, tagStore, driverId);
    if (!built.ok) return res.status(400).json({ ok: false, errors: built.errors });
    try {
      const body = {
        ...built.body,
        ...clientDeployMeta({ programName: programStore.activeRel() || '' }),
      };
      const mqttBody = slimPutProgramBodyForMqtt(body, built.traceMap);
      await hub().sendCommand(req.params.id, 'put_program', mqttBody);
      if (req.body?.start) await hub().sendCommand(req.params.id, 'runtime_start', { scanMs: req.body.scanMs || 100 });
      res.json({ ok: true, deployed: true });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  /** Ask Opta to rescan expansion modules and refresh tag table (MQTT cmd). */
  router.post('/parc/devices/:id/scan-expansions', async (req, res) => {
    if (!visibleDeviceOr404(res, req.params.id)) return;
    try {
      const body = await hub().sendCommand(req.params.id, 'scan_expansions', {});
      res.json({ ok: true, body });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  /** Replace PeakLogic tags for a driver from latest Parc telemetry. */
  router.post('/parc/devices/:id/sync-tags', async (req, res) => {
    if (!tagStore) return res.status(500).json({ error: 'tagStore required' });
    const driverId = req.body?.driverId;
    if (!driverId) return res.status(400).json({ error: 'driverId required' });
    const { mergeParcTagsIntoStore } = require('../../parc/parcTagSync');
    const { MAX_TAGS } = require('../../config');
    const dev = visibleDeviceOr404(res, req.params.id);
    if (!dev) return;
    if (dev.stale) {
      return res.status(409).json({ error: `Telemetry stale (${dev.ageSec ?? '?'}s)` });
    }
    const merged = mergeParcTagsIntoStore(tagStore.list(), dev.tags, driverId, {
      reassign: req.body?.reassign !== false,
    });
    if (!merged.ok) return res.status(400).json({ error: merged.error, conflicts: merged.conflicts });
    if (merged.tags.length > MAX_TAGS) {
      return res.status(413).json({ error: `Tag limit ${MAX_TAGS} exceeded` });
    }
    tagStore.replaceAll(merged.tags);
    res.json({
      ok: true,
      driverId,
      deviceId: req.params.id,
      tagsReplaced: merged.count,
      tagCount: tagStore.count(),
      expansionModules: dev.expansionModules || [],
    });
  });

  /** Remote programming / debug over MQTT (proxied to edge runtime). */
  router.post('/parc/devices/:id/cmd', async (req, res) => {
    if (!visibleDeviceOr404(res, req.params.id)) return;
    const { op, body } = req.body || {};
    if (!op) return res.status(400).json({ error: 'op required' });
    try {
      if (op === 'opta_set_relay') {
        const relay = Number(body?.relay);
        if (!relay) return res.status(400).json({ error: 'body.relay required (1-based)' });
        hub().publishLegacyOptaRelay(relay, body?.state);
        return res.json({ ok: true, body: { relay, state: !!body?.state } });
      }
      const result = await hub().sendCommand(req.params.id, op, body);
      res.json({ ok: true, body: result });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createParcRoutes };

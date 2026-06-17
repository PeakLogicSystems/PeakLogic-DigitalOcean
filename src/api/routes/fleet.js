'use strict';

const programStore = require('../../programs/programStore');
const { registry } = require('../../fleet/deviceRegistry');
const { getMqttCentralHub } = require('../../fleet/mqttCentralHub');
const { buildOptaProgramBody } = require('../../fleet/mqttOptaProgram');

function hub() {
  return getMqttCentralHub(registry);
}

function createFleetRoutes(deps = {}) {
  const { tagStore } = deps;
  const router = require('express').Router();

  router.get('/fleet/settings', (req, res) => {
    res.json({
      settings: registry.settings(),
      mqtt: hub().status(),
    });
  });

  router.put('/fleet/settings', (req, res) => {
    const patch = req.body || {};
    res.json({ settings: registry.updateSettings(patch) });
  });

  router.get('/fleet/devices', (req, res) => {
    res.json({
      devices: registry.listDevices(),
      settings: registry.settings(),
      mqtt: hub().status(),
    });
  });

  router.get('/fleet/devices/:id', (req, res) => {
    const device = registry.getDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ device });
  });

  router.get('/fleet/devices/:id/reporter', (req, res) => {
    res.json(registry.reporterConfig(req.params.id));
  });

  /** Legacy HTTP ingest — prefer MQTT telemetry from edge runtime. */
  router.post('/fleet/report', (req, res) => {
    const result = registry.ingestReport(req.body || {});
    if (!result.ok) return res.status(result.status || 400).json(result);
    res.json(result);
  });

  router.post('/fleet/devices/:id/attach', (req, res) => {
    const body = req.body || {};
    const device = registry.attach(req.params.id, {
      host: body.host,
      port: body.port,
      sessionId: body.sessionId,
    });
    hub().publishDeviceConfig(req.params.id, { pauseTelemetry: true, debugAttached: true });
    res.json({
      ok: true,
      device,
      transport: 'mqtt',
      message: 'Debug attach: telemetry throttled; program device via POST /api/fleet/devices/:id/cmd',
    });
  });

  router.post('/fleet/devices/:id/detach', (req, res) => {
    const device = registry.detach(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    hub().publishDeviceConfig(req.params.id, { pauseTelemetry: false, debugAttached: false });
    res.json({ ok: true, device, transport: 'mqtt' });
  });

  /** Deploy ST program to MQTT Opta ST device (parses .st → AST). */
  router.post('/fleet/devices/:id/program', async (req, res) => {
    if (!tagStore) return res.status(500).json({ error: 'tagStore required' });
    const source = req.body?.source ?? programStore.readActive();
    const driverId = req.body?.driverId || req.params.id;
    const built = buildOptaProgramBody(source, tagStore, driverId);
    if (!built.ok) return res.status(400).json({ ok: false, errors: built.errors });
    try {
      await hub().sendCommand(req.params.id, 'put_program', built.body);
      if (req.body?.start) await hub().sendCommand(req.params.id, 'runtime_start', { scanMs: req.body.scanMs || 100 });
      res.json({ ok: true, deployed: true });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message || String(e) });
    }
  });

  /** Remote programming / debug over MQTT (proxied to edge runtime). */
  router.post('/fleet/devices/:id/cmd', async (req, res) => {
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

module.exports = { createFleetRoutes };

'use strict';

const { optaHttpRequest } = require('../drivers/optaHttpClient');
const { normalizeAteccSerialHex } = require('./optaSerial');
const { findRegistryDeviceForDriver } = require('./parcDeviceResolve');

/** GET /api/io-map from Opta Ethernet. */
async function fetchOptaIoMap(host, opts = {}) {
  const h = String(host || '').trim();
  if (!h) {
    throw Object.assign(new Error('Opta host required'), { status: 400 });
  }
  const port = opts.port != null ? Number(opts.port) : 80;
  const url = port === 80 ? `http://${h}/api/io-map` : `http://${h}:${port}/api/io-map`;
  const body = await optaHttpRequest(url, {
    method: 'GET',
    timeoutMs: opts.timeoutMs || 15000,
  });
  if (!body || body.ok === false) {
    throw Object.assign(
      new Error(body?.error || 'Opta /api/io-map failed'),
      { status: 502 },
    );
  }
  return body;
}

/** Map io-map points → Parc telemetry tag rows (input/output only). */
function ioMapPointsToParcTags(points) {
  const rows = [];
  for (const p of points || []) {
    const role = String(p?.role || '').toLowerCase();
    if (role !== 'input' && role !== 'output') continue;
    const id = String(p?.id || '').trim();
    if (!id) continue;
    rows.push({
      id,
      type: String(p.type || 'BOOL').toUpperCase(),
      role,
      value: p.value,
      quality: p.quality || 'GOOD',
      forceInput: !!p.forceInput,
      forceOutput: !!p.forceOutput,
    });
  }
  return rows;
}

/**
 * Resolve Opta HTTP host: device meta, same-serial sibling, or driver cfg.host.
 */
function resolveOptaHost(registry, cfg, device) {
  const fromCfg = String(cfg?.host || '').trim();
  const fromDevice = String(
    device?.meta?.ethIp || device?.meta?.lastHost || device?.attachHost || '',
  ).trim();
  if (fromDevice) return fromDevice;
  if (fromCfg) return fromCfg;

  const serial = normalizeAteccSerialHex(
    cfg?.ateccSerial || device?.meta?.ateccSerial || device?.ateccSerial || '',
  );
  if (!serial) return '';

  for (const summary of registry.listDevices()) {
    const devSerial = normalizeAteccSerialHex(summary.ateccSerial || '');
    if (devSerial !== serial) continue;
    const dev = registry.getDevice(summary.deviceId);
    const host = String(dev?.meta?.ethIp || dev?.meta?.lastHost || dev?.attachHost || '').trim();
    if (host) return host;
  }
  return '';
}

module.exports = {
  fetchOptaIoMap,
  ioMapPointsToParcTags,
  resolveOptaHost,
  findRegistryDeviceForDriver,
};

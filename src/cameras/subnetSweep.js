'use strict';

const net = require('net');
const { localIpv4Interfaces } = require('./onvifDiscover');

const DEFAULT_ONVIF_PORTS = [8000, 80];
// Ports that indicate a camera is present even when ONVIF/RTSP are disabled.
// 9000 = Reolink native app/media port, 554 = RTSP (often disabled by default).
const DEFAULT_DETECT_PORTS = [9000, 554];

/** Hosts to scan on the /24 containing iface.address (skips self). */
function hostsForInterface(iface) {
  const parts = String(iface?.address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return [];
  const self = parts[3];
  const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const hosts = [];
  for (let i = 1; i <= 254; i += 1) {
    if (i === self) continue;
    hosts.push(`${base}.${i}`);
  }
  return hosts;
}

function tcpPortOpen(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: timeoutMs });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch { /* ignore */ }
      resolve(ok);
    };
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}

async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx;
      idx += 1;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function hitFromOpenPort(host, port) {
  return {
    host,
    port,
    onvifUrl: `http://${host}:${port}/onvif/device_service`,
    name: `Camera ${host}`,
    manufacturer: '',
    model: '',
    onvifProfile: '',
    scopes: '',
    address: host,
    discoveryMethod: 'subnet-sweep',
  };
}

/** A camera that answered on a native/RTSP port but has no reachable ONVIF endpoint. */
function needsSetupHit(host, openDetectPorts) {
  const reolink = openDetectPorts.includes(9000);
  return {
    host,
    port: openDetectPorts[0],
    onvifUrl: '',
    name: `Camera ${host} (ONVIF disabled)`,
    manufacturer: reolink ? 'Reolink' : '',
    model: '',
    onvifProfile: '',
    scopes: '',
    address: host,
    vendor: reolink ? 'reolink' : '',
    discoveryMethod: 'subnet-sweep',
    onvifDisabled: true,
    needsSetup: true,
    openPorts: openDetectPorts.slice(),
    note: reolink
      ? 'Reachable Reolink camera detected, but ONVIF/RTSP are turned off. Enable ONVIF and RTSP in the Reolink app/web UI (Settings > Network > Advanced > Server/Port Settings), then Add by IP or re-scan.'
      : 'Camera detected, but ONVIF is not reachable. Enable ONVIF/RTSP on the device, then Add by IP or re-scan.',
  };
}

/**
 * TCP sweep of local /24 subnets for ONVIF HTTP ports (Reolink: 8000, 80).
 * Also probes native/RTSP ports (9000, 554) so cameras with ONVIF disabled are
 * surfaced with a "needs setup" note instead of being silently missed.
 * Works when multicast/broadcast WS-Discovery is blocked.
 * @param {{ ports?: number[], detectPorts?: number[], connectTimeoutMs?: number, concurrency?: number, interfaces?: object[] }} [opts]
 * @returns {Promise<Array<object>>}
 */
/** Estimate sweep duration from host/port count so Promise.race does not discard results early. */
function estimateSweepTimeoutMs(opts = {}) {
  const ports = Array.isArray(opts.ports) && opts.ports.length
    ? opts.ports
    : DEFAULT_ONVIF_PORTS;
  const detectPorts = opts.detectPorts === false
    ? []
    : (Array.isArray(opts.detectPorts) && opts.detectPorts.length
      ? opts.detectPorts
      : DEFAULT_DETECT_PORTS);
  const connectTimeoutMs = Math.max(100, Math.min(2000, Number(opts.connectTimeoutMs) || 350));
  const concurrency = Math.max(8, Math.min(128, Number(opts.concurrency) || 48));
  const ifaces = opts.interfaces || localIpv4Interfaces();
  const seenHost = new Set();
  for (const iface of ifaces) {
    for (const host of hostsForInterface(iface)) seenHost.add(host);
  }
  const taskCount = seenHost.size * Array.from(new Set([...ports, ...detectPorts])).length;
  if (!taskCount) return 12000;
  const batches = Math.ceil(taskCount / concurrency);
  return Math.max(12000, Math.min(90000, Math.ceil(batches * connectTimeoutMs * 1.25) + 2000));
}

async function discoverOnvifSubnet(opts = {}) {
  const ports = Array.isArray(opts.ports) && opts.ports.length
    ? opts.ports.map((p) => Number(p)).filter((p) => p > 0 && p <= 65535)
    : DEFAULT_ONVIF_PORTS;
  const detectPorts = opts.detectPorts === false
    ? []
    : (Array.isArray(opts.detectPorts) && opts.detectPorts.length
      ? opts.detectPorts.map((p) => Number(p)).filter((p) => p > 0 && p <= 65535)
      : DEFAULT_DETECT_PORTS);
  const connectTimeoutMs = Math.max(100, Math.min(2000, Number(opts.connectTimeoutMs) || 350));
  const concurrency = Math.max(8, Math.min(128, Number(opts.concurrency) || 48));
  const ifaces = opts.interfaces || localIpv4Interfaces();
  if (!ifaces.length || (!ports.length && !detectPorts.length)) return [];

  const seenHost = new Set();
  const hostList = [];
  for (const iface of ifaces) {
    for (const host of hostsForInterface(iface)) {
      if (seenHost.has(host)) continue;
      seenHost.add(host);
      hostList.push(host);
    }
  }

  const allPorts = Array.from(new Set([...ports, ...detectPorts]));
  const tasks = [];
  for (const host of hostList) {
    for (const port of allPorts) tasks.push({ host, port });
  }

  const results = await mapWithConcurrency(tasks, concurrency, async ({ host, port }) => {
    const ok = await tcpPortOpen(host, port, connectTimeoutMs);
    return ok ? { host, port } : null;
  });

  const openByHost = new Map();
  for (const r of results) {
    if (!r) continue;
    if (!openByHost.has(r.host)) openByHost.set(r.host, new Set());
    openByHost.get(r.host).add(r.port);
  }

  const hits = [];
  for (const [host, openSet] of openByHost) {
    const openOnvif = ports.filter((p) => openSet.has(p));
    if (openOnvif.length) {
      hits.push(hitFromOpenPort(host, openOnvif[0]));
      continue;
    }
    const openDetect = detectPorts.filter((p) => openSet.has(p));
    if (openDetect.length) {
      hits.push(needsSetupHit(host, openDetect));
    }
  }
  return hits;
}

module.exports = {
  DEFAULT_ONVIF_PORTS,
  DEFAULT_DETECT_PORTS,
  hostsForInterface,
  tcpPortOpen,
  hitFromOpenPort,
  needsSetupHit,
  estimateSweepTimeoutMs,
  discoverOnvifSubnet,
};

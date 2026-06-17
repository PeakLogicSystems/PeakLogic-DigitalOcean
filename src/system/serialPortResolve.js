'use strict';

const { listSerialPorts } = require('./serialPorts');

function normPort(p) {
  return String(p || '').trim().toUpperCase();
}

function isExcluded(path, excludeSet) {
  return excludeSet.has(normPort(path));
}

function pickFallback(ports, excludeSet, wanted) {
  const usb = ports.find((p) => p.usb && !isExcluded(p.path, excludeSet));
  if (usb) {
    return {
      path: usb.path,
      fallback: true,
      reason: wanted
        ? `Saved ${wanted} not available; using ${usb.path}`
        : `Using USB port ${usb.path}`,
    };
  }
  const free = ports.map((p) => p.path).filter((path) => !isExcluded(path, excludeSet));
  if (free.length) {
    return {
      path: free[0],
      fallback: true,
      reason: wanted
        ? `Saved ${wanted} not available; using ${free[0]}`
        : `Using ${free[0]}`,
    };
  }
  return null;
}

function resolveFromPortList(configured, ports, exclude = []) {
  const wanted = String(configured || '').trim();
  const excludeSet = new Set(exclude.map(normPort).filter(Boolean));
  const paths = ports.map((p) => p.path);
  if (wanted && paths.includes(wanted)) {
    return { path: wanted, fallback: false };
  }
  const fb = pickFallback(ports, excludeSet, wanted);
  if (fb) return fb;
  return {
    path: wanted || 'COM3',
    fallback: !!wanted,
    reason: wanted
      ? (excludeSet.size
        ? `Saved ${wanted} not available; other COM ports reserved by other drivers`
        : `Saved ${wanted} not available`)
      : 'No serial ports detected',
  };
}

/**
 * Pick a serial port path that exists. Prefer configured, then first USB, then any.
 * @param {string} configured
 * @param {{ exclude?: string[] }} [opts] ports reserved by other drivers — never use for fallback
 * @returns {Promise<{ path: string, fallback: boolean, reason?: string }>}
 */
async function resolveSerialPort(configured, opts = {}) {
  const ports = await listSerialPorts();
  return resolveFromPortList(configured, ports, opts.exclude);
}

module.exports = { resolveSerialPort, resolveFromPortList, normPort };

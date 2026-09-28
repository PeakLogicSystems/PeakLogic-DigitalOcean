'use strict';

const { defaultModbusRtuSerialPort } = require('../appliance/defaultRs485Port');

function hostRs485Ports(env = process.env) {
  const primary = String(env.PEAKLOGIC_RS485_PORT_A || '').trim()
    || defaultModbusRtuSerialPort(env);
  const secondary = String(env.PEAKLOGIC_RS485_PORT_B || '').trim()
    || (process.platform === 'win32' ? 'COM4' : '/dev/ttyLP4');
  return { primary, secondary };
}

/** Remap exported serial ports to this host (IOT-LINK PORT A/B, COM3, env overrides). */
function adaptProjectForHost(doc, env = process.env) {
  if (!doc || !Array.isArray(doc.drivers)) return { doc, warnings: [] };
  const warnings = [];
  const serialPorts = [];
  for (const d of doc.drivers) {
    const sp = d?.serialPort;
    if (typeof sp === 'string' && sp.trim()) {
      const p = sp.trim();
      if (!serialPorts.includes(p)) serialPorts.push(p);
    }
  }
  if (!serialPorts.length) return { doc, warnings };

  const { primary, secondary } = hostRs485Ports(env);
  const targets = [primary, secondary];
  const map = new Map();
  serialPorts.forEach((src, i) => {
    map.set(src, targets[i] || targets[targets.length - 1]);
  });

  let changed = false;
  const drivers = doc.drivers.map((d) => {
    if (!d?.serialPort || !map.has(d.serialPort)) return d;
    const next = map.get(d.serialPort);
    if (next !== d.serialPort) {
      changed = true;
      warnings.push(`Remapped ${d.id || 'driver'} serial ${d.serialPort} → ${next}`);
      return { ...d, serialPort: next };
    }
    return d;
  });
  if (!changed) return { doc, warnings };
  return { doc: { ...doc, drivers }, warnings };
}

module.exports = { adaptProjectForHost, hostRs485Ports };

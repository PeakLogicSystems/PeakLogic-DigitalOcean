'use strict';

const fs = require('fs');

const IOT_LINK_TTY = ['ttyLP0', 'ttyLP1', 'ttyLP2', 'ttyLP3', 'ttyLP4', 'ttyLP5', 'ttyLP6', 'ttyLP7'];

/** Compulab IOT-LINK terminal-block mapping (FARS4/FBRS4). */
const IOT_LINK_TTY_LABELS = {
  ttyLP0: 'system console — not RS-485',
  ttyLP4: 'PORT B (FBRS4)',
  ttyLP6: 'PORT A (FARS4)',
};

function iotLinkPortLabel(name) {
  return IOT_LINK_TTY_LABELS[name] || 'IOT-LINK UART';
}

function appendLinuxRs485Ports(list) {
  if (process.platform !== 'linux') return list;
  const out = [...list];
  for (const name of IOT_LINK_TTY) {
    const path = `/dev/${name}`;
    if (fs.existsSync(path) && !out.some((p) => p.path === path)) {
      out.push({ path, label: `${path} (${iotLinkPortLabel(name)})`, usb: false });
    }
  }
  return out;
}

async function listSerialPorts() {
  try {
    const { SerialPort } = require('serialport');
    const list = await SerialPort.list();
    const mapped = list.map((p) => {
      const label = [p.friendlyName, p.manufacturer, p.path].filter(Boolean).join(' — ') || p.path;
      const usb = !!(p.vendorId || p.productId
        || /USB|Serial|Arduino|CH340|CP210|FTDI|Prolific|Silicon/i.test(`${p.manufacturer || ''}${p.friendlyName || ''}`));
      return { path: p.path, label, usb };
    });
    return appendLinuxRs485Ports(mapped);
  } catch {
    if (process.platform === 'win32') {
      return Array.from({ length: 20 }, (_, i) => ({
        path: `COM${i + 1}`,
        label: `COM${i + 1}`,
        usb: false,
      }));
    }
    return appendLinuxRs485Ports([
      { path: '/dev/ttyUSB0', label: '/dev/ttyUSB0 (USB)', usb: true },
      { path: '/dev/ttyACM0', label: '/dev/ttyACM0 (USB)', usb: true },
    ]);
  }
}

module.exports = { listSerialPorts };

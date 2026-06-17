'use strict';

async function listSerialPorts() {
  try {
    const { SerialPort } = require('serialport');
    const list = await SerialPort.list();
    return list.map((p) => {
      const label = [p.friendlyName, p.manufacturer, p.path].filter(Boolean).join(' — ') || p.path;
      const usb = !!(p.vendorId || p.productId
        || /USB|Serial|Arduino|CH340|CP210|FTDI|Prolific|Silicon/i.test(`${p.manufacturer || ''}${p.friendlyName || ''}`));
      return { path: p.path, label, usb };
    });
  } catch {
    if (process.platform === 'win32') {
      return Array.from({ length: 20 }, (_, i) => ({
        path: `COM${i + 1}`,
        label: `COM${i + 1}`,
        usb: false,
      }));
    }
    return [
      { path: '/dev/ttyUSB0', label: '/dev/ttyUSB0 (USB)', usb: true },
      { path: '/dev/ttyACM0', label: '/dev/ttyACM0 (USB)', usb: true },
    ];
  }
}

module.exports = { listSerialPorts };

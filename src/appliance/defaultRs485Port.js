'use strict';

const fs = require('fs');

const IOT_LINK_PORT_A = '/dev/ttyLP6';

/** Default Modbus RTU serial device — IOT-LINK PORT A on Linux, COM3 on Windows. */
function defaultModbusRtuSerialPort(env = process.env) {
  const fromEnv = String(env.PEAKLOGIC_RS485_PORT_A || '').trim();
  if (fromEnv) return fromEnv;
  if (process.platform === 'linux' && fs.existsSync(IOT_LINK_PORT_A)) return IOT_LINK_PORT_A;
  return 'COM3';
}

module.exports = { defaultModbusRtuSerialPort, IOT_LINK_PORT_A };

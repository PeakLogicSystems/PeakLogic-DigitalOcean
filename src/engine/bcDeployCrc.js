'use strict';

/** Modbus CRC16 — must match mvProgCrc16 in firmware mv_program_store.cpp */
function modbusCrc16(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  let crc = 0xffff;
  for (let i = 0; i < b.length; i += 1) {
    crc ^= b[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? ((crc >> 1) ^ 0xa001) : (crc >> 1);
    }
  }
  return crc & 0xffff;
}

function bcDeployCrcFromBuffer(buf) {
  return modbusCrc16(buf);
}

function bcDeployCrcFromBase64(bcB64) {
  if (!bcB64) return 0;
  try {
    return bcDeployCrcFromBuffer(Buffer.from(String(bcB64), 'base64'));
  } catch {
    return 0;
  }
}

module.exports = {
  modbusCrc16,
  bcDeployCrcFromBuffer,
  bcDeployCrcFromBase64,
};

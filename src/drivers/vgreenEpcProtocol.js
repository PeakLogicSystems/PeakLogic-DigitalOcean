'use strict';

/** Regal GEN3 EPC custom Modbus RTU frames (Century VGreen / SPECK BADU VS pumps). */

const FC = {
  GO: 0x41,
  STOP: 0x42,
  STATUS: 0x43,
  SET_DEMAND: 0x44,
  READ_SENSOR: 0x45,
};

const ACK_REQ = 0x20;
const ACK_RSP = 0x10;

const RESPONSE_LEN = {
  [FC.GO]: 5,
  [FC.STOP]: 5,
  [FC.STATUS]: 6,
  [FC.SET_DEMAND]: 8,
  [FC.READ_SENSOR]: 9,
};

const MOTOR_STATUS = {
  STOP: 0x00,
  RUN_BOOT: 0x09,
  RUN: 0x0b,
  FAULT: 0x20,
};

const SENSOR_POINTS = {
  rpm: { page: 0x00, address: 0x00, scale: 4 },
  demand_rpm: { page: 0x00, address: 0x03, scale: 4 },
  torque: { page: 0x00, address: 0x04, scale: 1200 },
  power_w: { page: 0x00, address: 0x0a, scale: 1 },
  temp_c: { page: 0x00, address: 0x07, scale: 128 },
};

function crc16Modbus(buf) {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >> 1) ^ 0xa001) : (crc >> 1);
    }
  }
  return crc;
}

function appendCrc(frame) {
  const crc = crc16Modbus(frame);
  const out = Buffer.alloc(frame.length + 2);
  frame.copy(out, 0);
  out.writeUInt16LE(crc, frame.length);
  return out;
}

function buildFrame(slave, fc, payload = Buffer.alloc(0)) {
  return appendCrc(Buffer.concat([Buffer.from([slave & 0xff, fc]), payload]));
}

function verifyFrame(buf, slave, fc) {
  if (!buf || buf.length < 5) return { ok: false, error: 'short frame' };
  if (buf[0] !== (slave & 0xff)) return { ok: false, error: 'slave mismatch' };
  if (buf[1] !== fc) return { ok: false, error: 'function mismatch' };
  const expect = RESPONSE_LEN[fc];
  if (expect && buf.length < expect) return { ok: false, error: 'incomplete frame' };
  const body = buf.subarray(0, buf.length - 2);
  const crcGot = buf.readUInt16LE(buf.length - 2);
  if (crc16Modbus(body) !== crcGot) return { ok: false, error: 'CRC error' };
  if (buf[2] !== ACK_RSP) return { ok: false, error: 'bad ACK byte' };
  return { ok: true };
}

function frameGo(slave) {
  return buildFrame(slave, FC.GO, Buffer.from([ACK_REQ]));
}

function frameStop(slave) {
  return buildFrame(slave, FC.STOP, Buffer.from([ACK_REQ]));
}

function frameStatus(slave) {
  return buildFrame(slave, FC.STATUS, Buffer.from([ACK_REQ]));
}

function frameSetDemandRpm(slave, rpm) {
  const demand = Math.round(Number(rpm) || 0) * 4;
  const payload = Buffer.alloc(4);
  payload[0] = ACK_REQ;
  payload[1] = 0; // speed mode
  payload.writeUInt16LE(demand & 0xffff, 2);
  return buildFrame(slave, FC.SET_DEMAND, payload);
}

function frameReadSensor(slave, page, address) {
  return buildFrame(slave, FC.READ_SENSOR, Buffer.from([ACK_REQ, page & 0xff, address & 0xff]));
}

function parseStatus(buf, slave) {
  const v = verifyFrame(buf, slave, FC.STATUS);
  if (!v.ok) return v;
  return { ok: true, value: buf[3] };
}

function parseSensor(buf, slave, scale = 1) {
  const v = verifyFrame(buf, slave, FC.READ_SENSOR);
  if (!v.ok) return v;
  const raw = buf.readUInt16LE(5);
  const value = scale > 1 ? raw / scale : raw;
  return { ok: true, value };
}

function parseSetDemand(buf, slave) {
  const v = verifyFrame(buf, slave, FC.SET_DEMAND);
  if (!v.ok) return v;
  return { ok: true, value: true };
}

function parseSimpleAck(buf, slave, fc) {
  const v = verifyFrame(buf, slave, fc);
  if (!v.ok) return v;
  return { ok: true, value: true };
}

module.exports = {
  FC,
  MOTOR_STATUS,
  SENSOR_POINTS,
  RESPONSE_LEN,
  frameGo,
  frameStop,
  frameStatus,
  frameSetDemandRpm,
  frameReadSensor,
  parseStatus,
  parseSensor,
  parseSetDemand,
  parseSimpleAck,
};

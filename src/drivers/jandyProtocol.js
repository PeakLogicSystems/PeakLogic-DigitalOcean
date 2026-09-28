'use strict';

/**
 * Jandy AquaLink RS-485 (9600 8N1) — DLE/STX/ETX framing.
 *
 * Frame: 10 02 [DEST] [CMD] [DATA…] [CHK] 10 03
 * Checksum: sum of DEST..last DATA byte, masked to 8 bits.
 * DLE escape: literal 0x10 in payload → 0x10 0x00 (receiver strips 0x00).
 *
 * Refs: AqualinkD JANDY_RS485_PROTOCOL.md, source/aq_serial.h, source/epump.h
 */

const DLE = 0x10;
const STX = 0x02;
const ETX = 0x03;
const MASTER_ADDR = 0x00;

const DEFAULT_EPUMP_ADDR = 0x78;
const DEFAULT_AQUAPURE_ADDR = 0x50;
const DEFAULT_JXI_ADDR = 0x68;
const DEFAULT_LX_ADDR = 0x38;
const DEFAULT_HEAT_PUMP_ADDR = 0x70;

const CMD = {
  ACK: 0x01,
  STATUS: 0x02,
  PPM: 0x16,
  PERCENT_SET: 0x11,
  EPUMP_STATUS: 0x1f,
  EPUMP_RPM: 0x44,
  EPUMP_WATTS: 0x45,
  EPUMP_PING: 0x41,
  JXI_PING: 0x0c,
  JXI_STATUS: 0x0d,
};

const DEVICE_CLASS = {
  EPUMP: 'epump',
  AQUAPURE: 'aquapure',
  JXI_HEATER: 'jxi_heater',
  LX_HEATER: 'lx_heater',
  HEAT_PUMP: 'heat_pump',
};

const EPUMP_POINTS = {
  rpm: { key: 'rpm' },
  watts: { key: 'watts' },
  running: { key: 'running' },
  run_cmd: { write: 'run' },
  rpm_cmd: { write: 'rpm' },
  watts_cmd: { write: 'watts' },
};

const AQUAPURE_POINTS = {
  salt_ppm: { key: 'saltPpm' },
  swg_status: { key: 'swgStatus' },
  swg_no_flow: { key: 'noFlow', bit: 0 },
  swg_low_salt: { key: 'lowSalt', bit: 1 },
  swg_high_salt: { key: 'highSalt', bit: 2 },
  swg_clean: { key: 'cleanCell', bit: 3 },
  percent_cmd: { write: 'percent' },
};

const HEATER_POINTS = {
  heater_error: { key: 'error' },
  heater_running: { key: 'running' },
  status_raw: { key: 'statusRaw' },
};

function checksum8(dest, cmd, data = Buffer.alloc(0)) {
  let sum = (dest & 0xff) + (cmd & 0xff);
  for (let i = 0; i < data.length; i++) sum += data[i];
  return sum & 0xff;
}

function escapePayload(bytes) {
  const out = [];
  for (const b of bytes) {
    out.push(b);
    if (b === DLE) out.push(0x00);
  }
  return Buffer.from(out);
}

function unescapePayload(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === DLE && i + 1 < bytes.length && bytes[i + 1] === 0x00) {
      out.push(DLE);
      i += 1;
      continue;
    }
    out.push(bytes[i]);
  }
  return Buffer.from(out);
}

function buildFrame(dest, cmd, data = Buffer.alloc(0)) {
  const payload = escapePayload(Buffer.concat([Buffer.from([dest & 0xff, cmd & 0xff]), data]));
  const chk = checksum8(dest, cmd, data);
  const escapedChk = escapePayload(Buffer.from([chk]));
  return Buffer.concat([
    Buffer.from([DLE, STX]),
    payload,
    escapedChk,
    Buffer.from([DLE, ETX]),
  ]);
}

function findFrame(buf) {
  if (!buf || buf.length < 6) return { ok: false, error: 'short buffer' };
  for (let i = 0; i < buf.length - 5; i++) {
    if (buf[i] !== DLE || buf[i + 1] !== STX) continue;
    let j = i + 2;
    const rawPayload = [];
    while (j < buf.length - 1) {
      if (buf[j] === DLE) {
        if (j + 1 < buf.length && buf[j + 1] === ETX) {
          const payload = unescapePayload(Buffer.from(rawPayload));
          if (payload.length < 3) return { ok: false, error: 'incomplete frame' };
          const dest = payload[0];
          const cmd = payload[1];
          const data = payload.subarray(2, payload.length - 1);
          const chk = payload[payload.length - 1];
          if (checksum8(dest, cmd, data) !== chk) {
            return { ok: false, error: 'checksum error' };
          }
          return {
            ok: true,
            offset: i,
            frameEnd: j + 2,
            dest,
            cmd,
            data,
            raw: buf.subarray(i, j + 2),
          };
        }
      }
      rawPayload.push(buf[j]);
      j += 1;
    }
  }
  return { ok: false, error: 'no valid frame' };
}

function frameEpumpRpm(deviceAddr, rpm) {
  const demand = Math.max(0, Math.round(Number(rpm) || 0)) * 4;
  const lo = demand & 0xff;
  const hi = (demand >> 8) & 0xff;
  return buildFrame(deviceAddr, CMD.EPUMP_RPM, Buffer.from([0x00, hi, lo]));
}

function frameEpumpWatts(deviceAddr, watts) {
  const w = Math.max(0, Math.round(Number(watts) || 0));
  const lo = w & 0xff;
  const hi = (w >> 8) & 0xff;
  return buildFrame(deviceAddr, CMD.EPUMP_WATTS, Buffer.from([0x00, hi, lo]));
}

function frameEpumpPing(deviceAddr) {
  return buildFrame(deviceAddr, CMD.EPUMP_PING, Buffer.alloc(0));
}

function frameAquapureStatus(deviceAddr) {
  return buildFrame(deviceAddr, CMD.STATUS, Buffer.alloc(0));
}

function frameAquapurePercent(deviceAddr, percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return buildFrame(deviceAddr, CMD.PERCENT_SET, Buffer.from([p]));
}

function frameJxiPing(deviceAddr) {
  return buildFrame(deviceAddr, CMD.JXI_PING, Buffer.alloc(0));
}

function parseEpumpStatus(buf, expectedOrigCmd) {
  const f = Buffer.isBuffer(buf) ? findFrame(buf) : buf;
  if (!f.ok) return f;
  if (f.cmd !== CMD.EPUMP_STATUS) return { ok: false, error: 'expected ePump status' };
  if (f.dest !== MASTER_ADDR) return { ok: false, error: 'unexpected dest' };
  const d = f.data;
  if (d.length < 4) return { ok: false, error: 'short ePump payload' };
  const origCmd = d[0];
  if (expectedOrigCmd != null && origCmd !== (expectedOrigCmd & 0xff)) {
    return { ok: false, error: 'orig cmd mismatch' };
  }
  let rpm = 0;
  let watts = 0;
  if (origCmd === CMD.EPUMP_RPM && d.length >= 4) {
    rpm = Math.round(((d[3] * 256) + d[2]) / 4);
  } else if (origCmd === CMD.EPUMP_WATTS && d.length >= 4) {
    watts = (d[3] * 256) + d[2];
  }
  return {
    ok: true,
    origCmd,
    rpm,
    watts,
    running: rpm > 0 || watts > 0,
    data: d,
  };
}

function parseAquapureResponse(buf) {
  const f = Buffer.isBuffer(buf) ? findFrame(buf) : buf;
  if (!f.ok) return f;
  if (f.dest !== MASTER_ADDR) return { ok: false, error: 'unexpected dest' };
  if (f.cmd === CMD.PPM && f.data.length >= 2) {
    const status = f.data[1];
    return {
      ok: true,
      saltPpm: f.data[0] * 100,
      swgStatus: status,
      noFlow: (status & 0x01) !== 0,
      lowSalt: (status & 0x02) !== 0,
      highSalt: (status & 0x04) !== 0,
      cleanCell: (status & 0x08) !== 0,
      data: f.data,
    };
  }
  if (f.cmd === CMD.ACK) return { ok: true, ack: true, data: f.data };
  return { ok: false, error: 'unexpected aquapure response' };
}

function parseHeaterStatus(buf) {
  const f = Buffer.isBuffer(buf) ? findFrame(buf) : buf;
  if (!f.ok) return f;
  if (f.dest !== MASTER_ADDR) return { ok: false, error: 'unexpected dest' };
  if (f.cmd !== CMD.JXI_STATUS && f.cmd !== CMD.STATUS) {
    return { ok: false, error: 'expected heater status' };
  }
  const statusRaw = f.data.length ? f.data[0] : 0;
  const errorByte = f.data.length > 2 ? f.data[2] : 0;
  const error = errorByte === 0x10;
  return {
    ok: true,
    statusRaw,
    error,
    running: !error && statusRaw !== 0,
    data: f.data,
  };
}

function normalizeDeviceClass(raw) {
  const c = String(raw || '').toLowerCase();
  if (c === 'epump' || c === 'pump') return DEVICE_CLASS.EPUMP;
  if (c === 'aquapure' || c === 'swg' || c === 'chlorinator') return DEVICE_CLASS.AQUAPURE;
  if (c === 'jxi' || c === 'jxi_heater') return DEVICE_CLASS.JXI_HEATER;
  if (c === 'lx' || c === 'lx_heater') return DEVICE_CLASS.LX_HEATER;
  return DEVICE_CLASS.HEAT_PUMP;
}

function defaultAddr(deviceClass) {
  const dc = normalizeDeviceClass(deviceClass);
  if (dc === DEVICE_CLASS.EPUMP) return DEFAULT_EPUMP_ADDR;
  if (dc === DEVICE_CLASS.AQUAPURE) return DEFAULT_AQUAPURE_ADDR;
  if (dc === DEVICE_CLASS.JXI_HEATER) return DEFAULT_JXI_ADDR;
  if (dc === DEVICE_CLASS.LX_HEATER) return DEFAULT_LX_ADDR;
  return DEFAULT_HEAT_PUMP_ADDR;
}

function pointValue(point, ctx) {
  const { epump, aquapure, heater } = ctx;
  if (EPUMP_POINTS[point]) {
    const spec = EPUMP_POINTS[point];
    if (spec.write) return null;
    if (!epump?.ok) return null;
    return epump[spec.key];
  }
  if (AQUAPURE_POINTS[point]) {
    const spec = AQUAPURE_POINTS[point];
    if (spec.write) return null;
    if (!aquapure?.ok) return null;
    if (spec.bit != null && aquapure.swgStatus != null) {
      return (aquapure.swgStatus & (1 << spec.bit)) !== 0;
    }
    return aquapure[spec.key];
  }
  const hspec = HEATER_POINTS[point];
  if (!hspec) return null;
  if (!heater?.ok) return null;
  return heater[hspec.key];
}

function buildStatusRequest(deviceAddr, deviceClass) {
  const dc = normalizeDeviceClass(deviceClass);
  if (dc === DEVICE_CLASS.EPUMP) return frameEpumpRpm(deviceAddr, 0);
  if (dc === DEVICE_CLASS.AQUAPURE) return frameAquapureStatus(deviceAddr);
  return frameJxiPing(deviceAddr);
}

function parseStatusResponse(buf, deviceAddr, deviceClass) {
  const dc = normalizeDeviceClass(deviceClass);
  if (dc === DEVICE_CLASS.EPUMP) return parseEpumpStatus(buf, CMD.EPUMP_RPM);
  if (dc === DEVICE_CLASS.AQUAPURE) return parseAquapureResponse(buf);
  return parseHeaterStatus(buf);
}

function expectedResponseCmd(deviceClass) {
  const dc = normalizeDeviceClass(deviceClass);
  if (dc === DEVICE_CLASS.EPUMP) return CMD.EPUMP_STATUS;
  if (dc === DEVICE_CLASS.AQUAPURE) return CMD.PPM;
  return CMD.JXI_STATUS;
}

module.exports = {
  DLE,
  STX,
  ETX,
  MASTER_ADDR,
  DEFAULT_EPUMP_ADDR,
  DEFAULT_AQUAPURE_ADDR,
  DEFAULT_JXI_ADDR,
  DEFAULT_LX_ADDR,
  DEFAULT_HEAT_PUMP_ADDR,
  CMD,
  DEVICE_CLASS,
  EPUMP_POINTS,
  AQUAPURE_POINTS,
  HEATER_POINTS,
  checksum8,
  buildFrame,
  findFrame,
  frameEpumpRpm,
  frameEpumpWatts,
  frameEpumpPing,
  frameAquapureStatus,
  frameAquapurePercent,
  frameJxiPing,
  parseEpumpStatus,
  parseAquapureResponse,
  parseHeaterStatus,
  normalizeDeviceClass,
  defaultAddr,
  pointValue,
  buildStatusRequest,
  parseStatusResponse,
  expectedResponseCmd,
};

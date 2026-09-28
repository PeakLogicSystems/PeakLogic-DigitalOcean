'use strict';

/**
 * Pentair proprietary RS-485 (9600 8N1) — NOT Modbus.
 *
 * IntelliFlo / heat pump / valve frames:
 *   FF 00 FF A5 [type] [dst] [src] [cmd] [len] [data…] [chk_hi] [chk_lo]
 *
 * IntelliChlor frames (same bus, different protocol):
 *   10 02 [cmd…] [crc8] 10 03
 *
 * Refs: nodejs-poolController wiki, ESPHome pentair_if_ic, poolprotocols.
 */

const PREAMBLE = Buffer.from([0xFF, 0x00, 0xFF]);
const FRAME_START = 0xA5;
const MASTER_ADDR = 0x10;
const DEFAULT_CONTROLLER_ADDR = 0x10;
const DEFAULT_PUMP_ADDR = 0x60;
const DEFAULT_HEAT_PUMP_ADDR = 0x70;
const DEFAULT_INTELLIVALVE_ADDR = 0x0c;

const IC_FRAME_HEADER = Buffer.from([0x10, 0x02]);
const IC_FRAME_FOOTER = Buffer.from([0x10, 0x03]);

const CMD = {
  SPEED: 0x01,
  REMOTECTL: 0x04,
  POWER: 0x06,
  STATUS: 0x07,
  FLOW: 0x09,
  ULTRATEMP_CMD: 0x72,
  ULTRATEMP_STATUS: 0x73,
  MASTERTEMP_STATUS: 0x74,
  GET_VALVES: 0xDD, // 221
};

const HEAT_MODE = {
  OFF: 0,
  HEAT: 1,
  COOL: 2,
};

const DEVICE_CLASS = {
  INTELLIFLO: 'intelliflo',
  PUMP: 'pump',
  INTELLICHLOR: 'intellichlor',
  VALVE: 'valve',
  INTELLIVALVE: 'intellivalve',
  HEAT_PUMP_ULTRATEMP: 'ultratemp',
  HEAT_PUMP_MASTERTEMP: 'mastertemp',
};

const PUMP_DRIVE = {
  FAULT: 0x00,
  PRIMING: 0x01,
  RUNNING: 0x02,
  SYS_PRIMING: 0x04,
};

const PUMP_POINTS = {
  running: { key: 'running' },
  mode: { key: 'mode' },
  drive_state: { key: 'driveState' },
  watts: { key: 'watts' },
  rpm: { key: 'rpm' },
  flow: { key: 'flow' },
  command: { key: 'command' },
  status_speck: { key: 'statusSpeck' },
  run_cmd: { write: 'run' },
  stop_cmd: { write: 'stop' },
  remote_cmd: { write: 'remote' },
  rpm_cmd: { write: 'rpm' },
};

const IC_POINTS = {
  salt_ppm: { key: 'saltPpm' },
  water_temp_f: { key: 'waterTempF' },
  ic_error: { key: 'icError' },
  ic_status: { key: 'icStatus' },
  ic_percent: { key: 'icPercent' },
  ic_no_flow: { key: 'noFlow', bit: 0 },
  ic_low_salt: { key: 'lowSalt', bit: 1 },
  ic_high_salt: { key: 'highSalt', bit: 2 },
  ic_clean: { key: 'cleanCell', bit: 3 },
  ic_percent_cmd: { write: 'percent' },
  ic_takeover_cmd: { write: 'takeover' },
};

const HEAT_PUMP_POINTS = {
  mode: { parse: 'ultratemp', key: 'mode' },
  running: { parse: 'ultratemp', key: 'running' },
  cooling: { parse: 'ultratemp', key: 'cooling' },
  offset_temp: { parse: 'ultratemp', key: 'offsetTemp' },
  mt_status: { parse: 'mastertemp', key: 'statusRaw' },
  mt_running: { parse: 'mastertemp', key: 'running' },
  mode_cmd: { write: 'heatMode' },
  run_cmd: { write: 'heatRun' },
};

const VALVE_POINTS = {
  valve1_pos: { key: 'valve1', index: 0 },
  valve2_pos: { key: 'valve2', index: 1 },
  valve3_pos: { key: 'valve3', index: 2 },
  valve4_pos: { key: 'valve4', index: 3 },
};

/** IntelliValve actuator commands (received by valve). Ref: nodejs-poolController #344. */
const INTELLIVALVE_CMD = {
  GOTO_0: 0x10,
  GOTO_24: 0x12,
  GOTO_MIDDLE: 0x14,
  GET_DEGREES: 0x17,
  REMOTE: 0x20,
};

const INTELLIVALVE_RSP = {
  DEGREES: 0x06,
};

const INTELLIVALVE_POINTS = {
  pos_cmd: { write: 'posCmd' },
  pos_pv: { key: 'position' },
  at_pos: { key: 'atPos' },
};

function checksum16(bodyFromA5) {
  let sum = 0;
  for (let i = 0; i < bodyFromA5.length; i++) sum = (sum + bodyFromA5[i]) & 0xffff;
  return sum;
}

function icChecksum8(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) sum = (sum + bytes[i]) & 0xff;
  return sum;
}

function buildBody(dest, src, cmd, data = Buffer.alloc(0)) {
  const body = Buffer.alloc(6 + data.length);
  body[0] = FRAME_START;
  body[1] = 0x00;
  body[2] = dest & 0xff;
  body[3] = src & 0xff;
  body[4] = cmd & 0xff;
  body[5] = data.length & 0xff;
  if (data.length) data.copy(body, 6);
  return body;
}

function buildFrame(dest, src, cmd, data = Buffer.alloc(0)) {
  const body = buildBody(dest, src, cmd, data);
  const sum = checksum16(body);
  const frame = Buffer.alloc(PREAMBLE.length + body.length + 2);
  PREAMBLE.copy(frame, 0);
  body.copy(frame, PREAMBLE.length);
  frame.writeUInt16BE(sum, PREAMBLE.length + body.length);
  return frame;
}

function parseFrame(buf, offset = 0) {
  if (!buf || buf.length < offset + 10) return { ok: false, error: 'short buffer' };
  let i = offset;
  while (i < buf.length && buf[i] === 0xff) i += 1;
  if (i + 1 < buf.length && buf[i] === 0x00 && buf[i + 1] === 0xff) i += 2;
  if (i >= buf.length || buf[i] !== FRAME_START) return { ok: false, error: 'no frame start' };
  const start = i;
  if (buf.length < start + 8) return { ok: false, error: 'incomplete header' };
  const type = buf[start + 1];
  const dest = buf[start + 2];
  const src = buf[start + 3];
  const cmd = buf[start + 4];
  const len = buf[start + 5];
  const dataStart = start + 6;
  const frameEnd = dataStart + len + 2;
  if (buf.length < frameEnd) return { ok: false, error: 'incomplete frame' };
  const body = buf.subarray(start, dataStart + len);
  const chk = buf.readUInt16BE(dataStart + len);
  if (checksum16(body) !== chk) return { ok: false, error: 'checksum error' };
  return {
    ok: true,
    offset: start,
    frameEnd,
    type,
    dest,
    src,
    cmd,
    data: buf.subarray(dataStart, dataStart + len),
    raw: buf.subarray(start, frameEnd),
  };
}

function findFrame(buf) {
  for (let off = 0; off < buf.length; off++) {
    if (buf[off] !== FRAME_START && !(off > 0 && buf[off - 1] === 0xff)) continue;
    const parsed = parseFrame(buf, off > 0 ? off - 1 : 0);
    if (parsed.ok) return parsed;
  }
  return { ok: false, error: 'no valid frame' };
}

function buildIcFrame(commandBytes) {
  const cmd = Buffer.from(commandBytes);
  const crc = icChecksum8(Buffer.concat([IC_FRAME_HEADER, cmd]));
  return Buffer.concat([IC_FRAME_HEADER, cmd, Buffer.from([crc]), IC_FRAME_FOOTER]);
}

function findIcFrame(buf) {
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] !== 0x10 || buf[i + 1] !== 0x02) continue;
    for (let j = i + 2; j < buf.length - 1; j++) {
      if (buf[j] === 0x10 && buf[j + 1] === 0x03) {
        const packet = buf.subarray(i, j + 2);
        const body = packet.subarray(2, packet.length - 3);
        const crc = packet[packet.length - 3];
        if (icChecksum8(Buffer.concat([IC_FRAME_HEADER, body])) !== crc) {
          return { ok: false, error: 'IC checksum error' };
        }
        return { ok: true, data: body, raw: packet, offset: i, frameEnd: j + 2 };
      }
    }
  }
  return { ok: false, error: 'no IC frame' };
}

function framePumpRemoteCtl(deviceAddr, remoteOn) {
  return buildFrame(deviceAddr, MASTER_ADDR, CMD.REMOTECTL, Buffer.from([remoteOn ? 0xff : 0x00]));
}

function framePumpStatus(deviceAddr) {
  return buildFrame(deviceAddr, MASTER_ADDR, CMD.STATUS, Buffer.alloc(0));
}

function framePumpRun(deviceAddr) {
  return buildFrame(deviceAddr, MASTER_ADDR, CMD.POWER, Buffer.from([0x0a]));
}

function framePumpStop(deviceAddr) {
  return buildFrame(deviceAddr, MASTER_ADDR, CMD.POWER, Buffer.from([0x04]));
}

function framePumpSpeed(deviceAddr, rpm) {
  const hi = Math.floor(Math.max(0, rpm) / 256) & 0xff;
  const lo = Math.max(0, rpm) & 0xff;
  return buildFrame(deviceAddr, MASTER_ADDR, CMD.SPEED, Buffer.from([0x04, 0x02, 0xc4, hi, lo]));
}

function frameUltraTempCommand(deviceAddr, mode = 0, offset = 0) {
  const payload = Buffer.alloc(10, 0);
  payload[0] = 0x90;
  payload[1] = mode & 0xff;
  payload[3] = offset & 0xff;
  return buildFrame(deviceAddr, MASTER_ADDR, CMD.ULTRATEMP_CMD, payload);
}

function frameMasterTempPoll(deviceAddr) {
  return buildFrame(deviceAddr, MASTER_ADDR, CMD.MASTERTEMP_STATUS, Buffer.alloc(0));
}

function frameGetValves(controllerAddr = DEFAULT_CONTROLLER_ADDR) {
  return buildFrame(controllerAddr, MASTER_ADDR, CMD.GET_VALVES, Buffer.from([0x00]));
}

function intelliValveGotoCmd(mode) {
  const m = Math.round(Number(mode) || 0);
  if (m === 1) return INTELLIVALVE_CMD.GOTO_24;
  if (m === 2) return INTELLIVALVE_CMD.GOTO_MIDDLE;
  return INTELLIVALVE_CMD.GOTO_0;
}

function frameIntelliValveRemote(valveAddr, enable = true) {
  return buildFrame(valveAddr, MASTER_ADDR, INTELLIVALVE_CMD.REMOTE, Buffer.from([enable ? 0x01 : 0x00]));
}

function frameIntelliValveGoto(valveAddr, mode) {
  return buildFrame(valveAddr, MASTER_ADDR, intelliValveGotoCmd(mode), Buffer.alloc(0));
}

function frameIntelliValveGetDegrees(valveAddr) {
  return buildFrame(valveAddr, MASTER_ADDR, INTELLIVALVE_CMD.GET_DEGREES, Buffer.alloc(0));
}

function frameIcTakeover() {
  return buildIcFrame([0x50, 0x00, 0x00]);
}

function frameIcGetStatus() {
  return buildIcFrame([0x50, 0x12, 0x00]);
}

function frameIcGetTemp() {
  return buildIcFrame([0x50, 0x15, 0x00]);
}

function frameIcSetPercent(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (p === 16) return buildIcFrame([0x50, 0x11, p, 0x00]);
  return buildIcFrame([0x50, 0x11, p]);
}

function parsePumpStatus(buf, expectedSrc) {
  const f = Buffer.isBuffer(buf) ? findFrame(buf) : buf;
  if (!f.ok) return f;
  if (f.cmd !== CMD.STATUS) return { ok: false, error: 'expected pump status cmd' };
  if (expectedSrc != null && f.src !== (expectedSrc & 0xff)) {
    return { ok: false, error: 'source address mismatch' };
  }
  if (f.data.length < 7) return { ok: false, error: 'short pump payload' };
  const d = f.data;
  const driveState = d[2];
  const statusSpeck = driveState === PUMP_DRIVE.RUNNING ? 11
    : (driveState === PUMP_DRIVE.FAULT ? 32
      : (driveState === PUMP_DRIVE.PRIMING ? 9 : 0));
  return {
    ok: true,
    command: d[0],
    mode: d[1],
    driveState,
    running: driveState === PUMP_DRIVE.RUNNING,
    statusSpeck,
    watts: (d[3] * 256) + d[4],
    rpm: (d[5] * 256) + d[6],
    flow: d.length > 7 ? d[7] : 0,
    data: d,
  };
}

function parseUltraTempStatus(buf, expectedSrc) {
  const f = Buffer.isBuffer(buf) ? findFrame(buf) : buf;
  if (!f.ok) return f;
  if (f.cmd !== CMD.ULTRATEMP_STATUS) return { ok: false, error: 'expected UltraTemp status cmd' };
  if (expectedSrc != null && f.src !== (expectedSrc & 0xff)) {
    return { ok: false, error: 'source address mismatch' };
  }
  if (f.data.length < 3) return { ok: false, error: 'short UltraTemp payload' };
  const mode = f.data[2];
  return {
    ok: true,
    mode,
    running: mode >= 1,
    cooling: mode === 2,
    offsetTemp: f.data[3] || 0,
    data: f.data,
  };
}

function parseMasterTempStatus(buf, expectedSrc) {
  const f = Buffer.isBuffer(buf) ? findFrame(buf) : buf;
  if (!f.ok) return f;
  if (f.cmd !== CMD.MASTERTEMP_STATUS) return { ok: false, error: 'expected MasterTemp status cmd' };
  if (expectedSrc != null && f.src !== (expectedSrc & 0xff)) {
    return { ok: false, error: 'source address mismatch' };
  }
  if (!f.data.length) return { ok: false, error: 'short MasterTemp payload' };
  const statusRaw = f.data[1] ?? f.data[0];
  return {
    ok: true,
    statusRaw,
    running: statusRaw >= 1,
    cooling: false,
    data: f.data,
  };
}

function parseIntelliValveDegrees(buf, expectedSrc) {
  const f = Buffer.isBuffer(buf) ? findFrame(buf) : buf;
  if (!f.ok) return f;
  if (expectedSrc != null && f.src !== (expectedSrc & 0xff)) {
    return { ok: false, error: 'IntelliValve source address mismatch' };
  }
  if (f.cmd !== INTELLIVALVE_RSP.DEGREES || f.data.length < 2) {
    return { ok: false, error: 'expected IntelliValve degrees response' };
  }
  const position = f.data[0];
  const notMoving = f.data[1] === 1;
  return {
    ok: true,
    position,
    notMoving,
    atPos: notMoving,
    data: f.data,
  };
}

function parseValveStatus(buf) {
  const f = Buffer.isBuffer(buf) ? findFrame(buf) : buf;
  if (!f.ok) return f;
  const positions = [];
  for (let i = 0; i < Math.min(4, f.data.length); i++) positions.push(f.data[i]);
  return {
    ok: true,
    valve1: positions[0] ?? 0,
    valve2: positions[1] ?? 0,
    valve3: positions[2] ?? 0,
    valve4: positions[3] ?? 0,
    data: f.data,
  };
}

function parseIcResponse(buf) {
  const f = findIcFrame(buf);
  if (!f.ok) return f;
  const d = f.data;
  if (!d.length) return { ok: false, error: 'empty IC payload' };
  const sub = d[1];
  const out = { ok: true, subCmd: sub, data: d };
  if (sub === 0x16 && d.length >= 3) {
    out.waterTempF = d[2];
  } else if (sub === 0x12 && d.length >= 4) {
    out.saltPpm = d[2] * 50;
    out.icError = d[3];
    out.icPercent = d.length >= 5 ? d[4] : null;
    out.noFlow = (d[3] & 0x01) !== 0;
    out.lowSalt = (d[3] & 0x02) !== 0;
    out.highSalt = (d[3] & 0x04) !== 0;
    out.cleanCell = (d[3] & 0x08) !== 0;
  } else if (sub === 0x01) {
    out.icStatus = d[0];
  }
  return out;
}

function normalizeDeviceClass(raw) {
  const c = String(raw || '').toLowerCase();
  if (c === 'pump' || c === 'intelliflo') return DEVICE_CLASS.INTELLIFLO;
  if (c === 'intellichlor' || c === 'ic' || c === 'chlorinator') return DEVICE_CLASS.INTELLICHLOR;
  if (c === 'valve' || c === 'valves') return DEVICE_CLASS.VALVE;
  if (c === 'intellivalve' || c === 'iv') return DEVICE_CLASS.INTELLIVALVE;
  if (c === 'mastertemp') return DEVICE_CLASS.HEAT_PUMP_MASTERTEMP;
  return DEVICE_CLASS.HEAT_PUMP_ULTRATEMP;
}

function pointValue(point, ctx) {
  const { pump, ultratemp, mastertemp, ic, valves, intellivalve } = ctx;
  if (PUMP_POINTS[point]) {
    const spec = PUMP_POINTS[point];
    if (spec.write) return null;
    if (!pump?.ok) return null;
    return pump[spec.key];
  }
  if (IC_POINTS[point]) {
    const spec = IC_POINTS[point];
    if (spec.write) return null;
    if (!ic?.ok) return null;
    if (spec.bit != null && ic.icError != null) return (ic.icError & (1 << spec.bit)) !== 0;
    return ic[spec.key];
  }
  if (VALVE_POINTS[point]) {
    const spec = VALVE_POINTS[point];
    if (!valves?.ok) return null;
    return valves[spec.key];
  }
  if (INTELLIVALVE_POINTS[point]) {
    const spec = INTELLIVALVE_POINTS[point];
    if (spec.write) return null;
    if (!intellivalve?.ok) return null;
    return intellivalve[spec.key];
  }
  const hspec = HEAT_PUMP_POINTS[point];
  if (!hspec) return null;
  if (hspec.write) return null;
  if (hspec.parse === 'ultratemp' && ultratemp?.ok) return ultratemp[hspec.key];
  if (hspec.parse === 'mastertemp' && mastertemp?.ok) return mastertemp[hspec.key];
  return null;
}

function expectedResponseCmd(deviceClass) {
  const dc = normalizeDeviceClass(deviceClass);
  if (dc === DEVICE_CLASS.HEAT_PUMP_ULTRATEMP) return CMD.ULTRATEMP_STATUS;
  if (dc === DEVICE_CLASS.HEAT_PUMP_MASTERTEMP) return CMD.MASTERTEMP_STATUS;
  if (dc === DEVICE_CLASS.INTELLIFLO) return CMD.STATUS;
  if (dc === DEVICE_CLASS.VALVE) return null;
  if (dc === DEVICE_CLASS.INTELLIVALVE) return INTELLIVALVE_RSP.DEGREES;
  return null;
}

function buildStatusRequest(deviceAddr, deviceClass) {
  const dc = normalizeDeviceClass(deviceClass);
  if (dc === DEVICE_CLASS.HEAT_PUMP_ULTRATEMP) return frameUltraTempCommand(deviceAddr, 0, 0);
  if (dc === DEVICE_CLASS.HEAT_PUMP_MASTERTEMP) return frameMasterTempPoll(deviceAddr);
  if (dc === DEVICE_CLASS.INTELLIFLO) return framePumpStatus(deviceAddr);
  if (dc === DEVICE_CLASS.VALVE) return frameGetValves(deviceAddr || DEFAULT_CONTROLLER_ADDR);
  if (dc === DEVICE_CLASS.INTELLIVALVE) return frameIntelliValveGetDegrees(deviceAddr);
  return framePumpStatus(deviceAddr);
}

function parseStatusResponse(buf, deviceAddr, deviceClass) {
  const dc = normalizeDeviceClass(deviceClass);
  if (dc === DEVICE_CLASS.HEAT_PUMP_ULTRATEMP) return parseUltraTempStatus(buf, deviceAddr);
  if (dc === DEVICE_CLASS.HEAT_PUMP_MASTERTEMP) return parseMasterTempStatus(buf, deviceAddr);
  if (dc === DEVICE_CLASS.INTELLIFLO) return parsePumpStatus(buf, deviceAddr);
  if (dc === DEVICE_CLASS.VALVE) return parseValveStatus(buf);
  if (dc === DEVICE_CLASS.INTELLIVALVE) return parseIntelliValveDegrees(buf, deviceAddr);
  const f = findFrame(buf);
  if (!f.ok) return f;
  return { ok: true, raw: f };
}

module.exports = {
  PREAMBLE,
  FRAME_START,
  MASTER_ADDR,
  DEFAULT_CONTROLLER_ADDR,
  DEFAULT_PUMP_ADDR,
  DEFAULT_HEAT_PUMP_ADDR,
  DEFAULT_INTELLIVALVE_ADDR,
  IC_FRAME_HEADER,
  IC_FRAME_FOOTER,
  CMD,
  HEAT_MODE,
  DEVICE_CLASS,
  PUMP_DRIVE,
  PUMP_POINTS,
  IC_POINTS,
  HEAT_PUMP_POINTS,
  VALVE_POINTS,
  INTELLIVALVE_CMD,
  INTELLIVALVE_RSP,
  INTELLIVALVE_POINTS,
  checksum16,
  icChecksum8,
  buildFrame,
  buildBody,
  buildIcFrame,
  parseFrame,
  findFrame,
  findIcFrame,
  framePumpRemoteCtl,
  framePumpStatus,
  framePumpRun,
  framePumpStop,
  framePumpSpeed,
  frameUltraTempCommand,
  frameMasterTempPoll,
  frameGetValves,
  intelliValveGotoCmd,
  frameIntelliValveRemote,
  frameIntelliValveGoto,
  frameIntelliValveGetDegrees,
  frameIcTakeover,
  frameIcGetStatus,
  frameIcGetTemp,
  frameIcSetPercent,
  parsePumpStatus,
  parseUltraTempStatus,
  parseMasterTempStatus,
  parseValveStatus,
  parseIntelliValveDegrees,
  parseIcResponse,
  normalizeDeviceClass,
  pointValue,
  expectedResponseCmd,
  buildStatusRequest,
  parseStatusResponse,
};

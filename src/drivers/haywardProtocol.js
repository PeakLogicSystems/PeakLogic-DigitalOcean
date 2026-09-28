'use strict';

/**
 * Hayward low-speed RS-485 bus (19200 8N2 typical for OmniLogic/AquaLogic).
 *
 * VS pump command (EcoStar / TriStar VS / MaxFlo VS):
 *   10 02 0C 01 [HUA] [speed%] [chk_hi] [chk_lo] 10 03
 * Checksum: sum of DLE+STX+body bytes (Goldline AQ-CO-SERIAL manual).
 * DLE escape: 0x10 in body/checksum → insert 0x00 after byte.
 *
 * Pump status (unsolicited): frame type 00 0C — speed % at byte 2, power BCD at 3-4.
 *
 * Refs: swilson/aqualogic, desert-home EcoStar notes, nodejs-poolController.
 */

const DLE = 0x10;
const STX = 0x02;
const ETX = 0x03;

const DEFAULT_SRC_ADDR = 0x01;
const DEFAULT_PUMP_HUA = 0x00;

const CMD = {
  SET_REMOTE: 0x01,
  SET_SPEED: 0x0c,
};

const FRAME_TYPE = {
  PUMP_STATUS: Buffer.from([0x00, 0x0c]),
  PUMP_SPEED_REQUEST: Buffer.from([0x0c, 0x01]),
};

const DEVICE_CLASS = {
  VS_PUMP: 'vs_pump',
};

const PUMP_POINTS = {
  speed_pct: { key: 'speedPct' },
  rpm: { key: 'rpm' },
  watts: { key: 'watts' },
  running: { key: 'running' },
  speed_cmd: { write: 'speed' },
  run_cmd: { write: 'run' },
};

const DEFAULT_MAX_RPM = 3450;

function appendEscaped(out, byte) {
  out.push(byte & 0xff);
  if ((byte & 0xff) === DLE) out.push(0x00);
}

function buildGoldlineFrame(body) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
  let crc = DLE + STX;
  for (let i = 0; i < raw.length; i++) crc += raw[i];
  crc &= 0xffff;
  const out = [DLE, STX];
  for (let i = 0; i < raw.length; i++) appendEscaped(out, raw[i]);
  appendEscaped(out, (crc >> 8) & 0xff);
  appendEscaped(out, crc & 0xff);
  out.push(DLE, ETX);
  return Buffer.from(out);
}

/** Compact 10-byte EcoStar-style speed frame (desert-home / pool-controller). */
function buildSimpleSpeedFrame(destAddr, speedPct) {
  const dest = destAddr & 0xff;
  const speed = Math.max(0, Math.min(100, Math.round(Number(speedPct) || 0)));
  const chk = (DLE + STX + CMD.SET_SPEED + DEFAULT_SRC_ADDR + dest + speed) & 0xff;
  return Buffer.from([DLE, STX, CMD.SET_SPEED, DEFAULT_SRC_ADDR, dest, speed, 0x00, chk, DLE, ETX]);
}

function unescapeBuffer(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === DLE && i + 1 < buf.length && buf[i + 1] === 0x00) {
      out.push(DLE);
      i += 1;
      continue;
    }
    out.push(buf[i]);
  }
  return Buffer.from(out);
}

function findGoldlineFrame(buf) {
  if (!buf || buf.length < 8) return { ok: false, error: 'short buffer' };
  for (let i = 0; i < buf.length - 7; i++) {
    if (buf[i] !== DLE || buf[i + 1] !== STX) continue;
    let j = i + 2;
    const raw = [];
    while (j < buf.length - 1) {
      if (buf[j] === DLE) {
        if (j + 1 < buf.length && buf[j + 1] === ETX) {
          const payload = unescapeBuffer(Buffer.from(raw));
          if (payload.length < 4) return { ok: false, error: 'incomplete frame' };
          const frameCrc = (payload[payload.length - 2] << 8) | payload[payload.length - 1];
          const body = payload.subarray(0, payload.length - 2);
          let calc = DLE + STX;
          for (let k = 0; k < body.length; k++) calc += body[k];
          calc &= 0xffff;
          if (frameCrc !== calc) return { ok: false, error: 'checksum error' };
          return {
            ok: true,
            offset: i,
            frameEnd: j + 2,
            frameType: body.subarray(0, 2),
            data: body.subarray(2),
            body,
            raw: buf.subarray(i, j + 2),
          };
        }
      }
      raw.push(buf[j]);
      j += 1;
    }
  }
  return { ok: false, error: 'no valid frame' };
}

function findSimpleFrame(buf) {
  if (!buf || buf.length < 10) return { ok: false, error: 'short buffer' };
  for (let i = 0; i <= buf.length - 10; i++) {
    if (buf[i] !== DLE || buf[i + 1] !== STX) continue;
    if (buf[i + 8] !== DLE || buf[i + 9] !== ETX) continue;
    const dest = buf[i + 4];
    const speed = buf[i + 5];
    const chk = buf[i + 7];
    const calc = (DLE + STX + buf[i + 2] + buf[i + 3] + dest + speed) & 0xff;
    if (chk !== calc) continue;
    return {
      ok: true,
      offset: i,
      frameEnd: i + 10,
      cmd: buf[i + 2],
      src: buf[i + 3],
      dest,
      speed,
      raw: buf.subarray(i, i + 10),
    };
  }
  return { ok: false, error: 'no simple frame' };
}

function parsePumpStatus(buf) {
  const f = findGoldlineFrame(buf);
  if (!f.ok) return f;
  if (!f.frameType.equals(FRAME_TYPE.PUMP_STATUS)) {
    return { ok: false, error: 'not pump status frame' };
  }
  const d = f.data;
  if (d.length < 3) return { ok: false, error: 'short pump status' };
  const speedPct = d[0];
  const watts = d.length >= 3
    ? ((((d[1] & 0xf0) >> 4) * 1000)
      + ((d[1] & 0x0f) * 100)
      + (((d[2] & 0xf0) >> 4) * 10)
      + (d[2] & 0x0f))
    : 0;
  const rpm = Math.round((speedPct * DEFAULT_MAX_RPM) / 100);
  return {
    ok: true,
    speedPct,
    rpm,
    watts,
    running: speedPct > 0,
    data: d,
  };
}

function frameSetSpeed(destAddr, speedPct, useSimple = true) {
  if (useSimple) return buildSimpleSpeedFrame(destAddr, speedPct);
  const dest = destAddr & 0xff;
  const speed = Math.max(0, Math.min(100, Math.round(Number(speedPct) || 0)));
  return buildGoldlineFrame(Buffer.from([CMD.SET_SPEED, DEFAULT_SRC_ADDR, dest, speed]));
}

function frameSetRemote(destAddr) {
  return buildGoldlineFrame(Buffer.from([CMD.SET_REMOTE, DEFAULT_SRC_ADDR, destAddr & 0xff, 0x01]));
}

function normalizeDeviceClass(raw) {
  const c = String(raw || '').toLowerCase();
  if (c === 'vs_pump' || c === 'pump' || c === 'vsp') return DEVICE_CLASS.VS_PUMP;
  return DEVICE_CLASS.VS_PUMP;
}

function pointValue(point, ctx) {
  const spec = PUMP_POINTS[point];
  if (!spec) return null;
  if (spec.write) return null;
  if (!ctx.pump?.ok) return null;
  return ctx.pump[spec.key];
}

function pctToRpm(pct, maxRpm = DEFAULT_MAX_RPM) {
  return Math.round((Math.max(0, Math.min(100, Number(pct) || 0)) * maxRpm) / 100);
}

module.exports = {
  DLE,
  STX,
  ETX,
  DEFAULT_SRC_ADDR,
  DEFAULT_PUMP_HUA,
  DEFAULT_MAX_RPM,
  CMD,
  FRAME_TYPE,
  DEVICE_CLASS,
  PUMP_POINTS,
  buildGoldlineFrame,
  buildSimpleSpeedFrame,
  findGoldlineFrame,
  findSimpleFrame,
  parsePumpStatus,
  frameSetSpeed,
  frameSetRemote,
  normalizeDeviceClass,
  pointValue,
  pctToRpm,
};

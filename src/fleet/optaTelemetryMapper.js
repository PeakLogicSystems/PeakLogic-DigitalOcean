'use strict';

/** Map Arduino Opta status JSON (di_builtIn, analog, alarms) to PeakLogic fleet tags. */
function optaStatusToFleetReport(deviceId, raw, meta = {}) {
  const tags = [];
  const pushBool = (id, val, role = 'input') => {
    tags.push({ id, type: 'BOOL', role, value: !!val, quality: 'GOOD' });
  };
  const pushReal = (id, val, role = 'input') => {
    const n = Number(val);
    if (!Number.isFinite(n)) return;
    tags.push({ id, type: 'REAL', role, value: n, quality: 'GOOD' });
  };

  if (Array.isArray(raw.di_builtIn)) {
    raw.di_builtIn.forEach((v, i) => pushBool(`DI${i + 1}`, v));
  }
  if (Array.isArray(raw.do_builtIn)) {
    raw.do_builtIn.forEach((v, i) => pushBool(`Q${i + 1}`, v, 'output'));
  }
  if (Array.isArray(raw.di_digital)) {
    raw.di_digital.forEach((v, i) => pushBool(`DIX${i + 1}`, v));
  }
  if (Array.isArray(raw.do_digital)) {
    raw.do_digital.forEach((v, i) => pushBool(`QX${i + 1}`, v, 'output'));
  }

  const analog = raw.analog;
  if (analog && typeof analog === 'object') {
    if (analog.voltage1_V != null) pushReal('V1', analog.voltage1_V);
    if (analog.voltage2_V != null) pushReal('V2', analog.voltage2_V);
    if (Array.isArray(analog.mA)) {
      analog.mA.forEach((v, i) => pushReal(`mA_AI${i + 3}`, v));
    }
    if (Array.isArray(analog.scaled_mA)) {
      analog.scaled_mA.forEach((v, i) => pushReal(`scaled_AI${i + 3}`, v));
    }
    if (analog.rtd1 != null) pushReal('RTD1', analog.rtd1);
    if (analog.rtd2 != null) pushReal('RTD2', analog.rtd2);
  }

  if (Array.isArray(raw.alarms)) {
    for (const a of raw.alarms) {
      const name = a?.name || 'alarm';
      if (a?.low != null) pushBool(`${name}_LOW`, a.low);
      if (a?.warn != null) pushBool(`${name}_WARN`, a.warn);
      if (a?.high != null) pushBool(`${name}_HIGH`, a.high);
    }
  }

  return {
    deviceId,
    name: meta.name || deviceId,
    platform: meta.platform || 'arduino-opta',
    reportIntervalSec: meta.reportIntervalSec || 300,
    runtime: { running: true, firmware: 'opta-mqtt' },
    tags,
    driverHealth: [{ id: 'mqtt', type: 'mqtt', connected: true, message: 'OK' }],
    meta: { ...meta, source: 'opta-status' },
  };
}

module.exports = { optaStatusToFleetReport };

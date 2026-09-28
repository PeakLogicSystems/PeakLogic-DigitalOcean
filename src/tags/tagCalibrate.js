'use strict';

const { normalizeScale, normalizeOffset } = require('./tagAnalog');
const { normalizeLinearize, linearizeTempCToRaw } = require('./tagLinearize');
/** Two-point linear calibration → scale + offset (eng = raw × scale + offset). */
function twoPointToScaleOffset(rawLo, engLo, rawHi, engHi) {
  const r0 = Number(rawLo);
  const r1 = Number(rawHi);
  const e0 = Number(engLo);
  const e1 = Number(engHi);
  if (![r0, r1, e0, e1].every(Number.isFinite)) return null;
  if (r1 === r0) return null;
  const scale = (e1 - e0) / (r1 - r0);
  if (!Number.isFinite(scale) || scale === 0) return null;
  const offset = e0 - r0 * scale;
  return { scale, offset };
}

/** Derive two-point display from scale + offset (for dialog prefill). */
function scaleOffsetToTwoPoint(rawLo, rawHi, tag = {}) {
  const r0 = Number(rawLo);
  const r1 = Number(rawHi);
  if (!Number.isFinite(r0) || !Number.isFinite(r1) || r1 === r0) return null;
  const scale = normalizeScale(tag.scale);
  const offset = normalizeOffset(tag.offset);
  return {
    rawLo: r0,
    engLo: r0 * scale + offset,
    rawHi: r1,
    engHi: r1 * scale + offset,
  };
}

/**
 * Best-effort raw ADC for capture from stored/live value.
 * Modbus tags store engineering; MQTT Opta tags store raw ADC.
 */
function rawFromStoredValue(tag, storedValue) {
  const v = Number(storedValue);
  if (!Number.isFinite(v)) return null;
  if (normalizeLinearize(tag.linearize) === 'ntc_divider'
    || normalizeLinearize(tag.linearize) === 'opta_ntc_divider') {
    const scale = normalizeScale(tag.scale);
    const offset = normalizeOffset(tag.offset);
    const tempC = (v - offset) / scale;
    return linearizeTempCToRaw(tempC, tag);
  }
  const scale = normalizeScale(tag.scale);
  const offset = normalizeOffset(tag.offset);
  if (scale === 1 && offset === 0) return Math.round(v);
  return Math.round((v - offset) / scale);
}

module.exports = {
  twoPointToScaleOffset,
  scaleOffsetToTwoPoint,
  rawFromStoredValue,
};

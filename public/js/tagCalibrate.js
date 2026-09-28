'use strict';

/** Browser mirror of src/tags/tagLinearize.js + tagCalibrate.js (keep in sync). */
window.PeaklogicTagCal = (function () {
  function normalizeEngUnit(unit) {
    return unit === 'F' ? 'F' : 'C';
  }

  function ntcDisplayScaleOffset(engUnit, trim) {
    const u = normalizeEngUnit(engUnit);
    const trimN = Number.isFinite(Number(trim)) ? Number(trim) : 0;
    if (u === 'F') return { scale: 1.8, offset: 32 + trimN };
    return { scale: 1, offset: trimN };
  }

  function inferNtcEngUnit(tag) {
    tag = tag || {};
    if (tag.engUnit === 'F' || tag.engUnit === 'C') return tag.engUnit;
    const s = Number(tag.scale);
    const o = Number(tag.offset);
    if (Number.isFinite(s) && Math.abs(s - 1.8) < 0.05 && Number.isFinite(o) && o >= 28) return 'F';
    return 'C';
  }

  function ntcTrimFromTag(tag) {
    tag = tag || {};
    const unit = inferNtcEngUnit(tag);
    const o = Number(tag.offset) || 0;
    return unit === 'F' ? o - 32 : o;
  }

  function celsiusToFahrenheit(c) {
    return c * 1.8 + 32;
  }

  function normalizeLinearize(value) {
    const t = String(value || 'none').toLowerCase();
    if (t === 'opta_ntc_divider' || t === 'ntc_divider') return t;
    return 'none';
  }

  function normalizeNtcParams(tag) {
    tag = tag || {};
    return {
      adcMax: Number.isFinite(Number(tag.adcMax)) && Number(tag.adcMax) > 0 ? Number(tag.adcMax) : 1023,
      vRef: Number.isFinite(Number(tag.vRef)) && Number(tag.vRef) > 0 ? Number(tag.vRef) : 10,
      rFixed: Number.isFinite(Number(tag.rFixed)) && Number(tag.rFixed) > 0 ? Number(tag.rFixed) : 10000,
      ntcR25: Number.isFinite(Number(tag.ntcR25)) && Number(tag.ntcR25) > 0 ? Number(tag.ntcR25) : 10000,
      ntcBeta: Number.isFinite(Number(tag.ntcBeta)) && Number(tag.ntcBeta) > 0 ? Number(tag.ntcBeta) : 3950,
    };
  }

  function normalizeOptaNtcParams(tag) {
    tag = tag || {};
    return {
      adcMax: Number.isFinite(Number(tag.adcMax)) && Number(tag.adcMax) > 0 ? Number(tag.adcMax) : 1023,
      adcMaxVoltage: Number.isFinite(Number(tag.adcMaxVoltage)) && Number(tag.adcMaxVoltage) > 0
        ? Number(tag.adcMaxVoltage) : 10,
      vSupply: Number.isFinite(Number(tag.vSupply)) && Number(tag.vSupply) > 0 ? Number(tag.vSupply) : 24,
      rFixed: Number.isFinite(Number(tag.rFixed)) && Number(tag.rFixed) > 0 ? Number(tag.rFixed) : 10000,
      rOptaInternal: Number.isFinite(Number(tag.rOptaInternal)) && Number(tag.rOptaInternal) > 0
        ? Number(tag.rOptaInternal) : 5850,
      ntcR25: Number.isFinite(Number(tag.ntcR25)) && Number(tag.ntcR25) > 0 ? Number(tag.ntcR25) : 10000,
      ntcBeta: Number.isFinite(Number(tag.ntcBeta)) && Number(tag.ntcBeta) > 0 ? Number(tag.ntcBeta) : 3950,
    };
  }

  function betaNtcTempC(rNtc, ntcR25, ntcBeta) {
    if (rNtc <= 0) return null;
    const t0 = 273.15 + 25;
    const invT = (1 / t0) + (1 / ntcBeta) * Math.log(rNtc / ntcR25);
    if (invT <= 0) return null;
    return (1 / invT) - 273.15;
  }

  function ntcDividerTempC(raw, tag) {
    const { adcMax, vRef, rFixed, ntcR25, ntcBeta } = normalizeNtcParams(tag);
    const adc = Number(raw);
    if (!Number.isFinite(adc) || adc <= 0) return null;
    const v = (adc / adcMax) * vRef;
    if (v <= 0.001 || v >= vRef - 0.001) return null;
    const rNtc = rFixed * ((vRef / v) - 1);
    return betaNtcTempC(rNtc, ntcR25, ntcBeta);
  }

  function optaNtcDividerTempC(raw, tag) {
    const {
      adcMax, adcMaxVoltage, vSupply, rFixed, rOptaInternal, ntcR25, ntcBeta,
    } = normalizeOptaNtcParams(tag);
    const adc = Number(raw);
    if (!Number.isFinite(adc) || adc <= 0) return null;
    const vMeasured = (adc / adcMax) * adcMaxVoltage;
    if (vMeasured <= 0.001 || vMeasured >= adcMaxVoltage - 0.05) return null;
    if (vMeasured >= vSupply - 0.001) return null;
    const rEquivalent = (vMeasured * rFixed) / (vSupply - vMeasured);
    if (rEquivalent <= 0) return null;
    const invTherm = (1 / rEquivalent) - (1 / rOptaInternal);
    if (invTherm <= 0) return null;
    return betaNtcTempC(1 / invTherm, ntcR25, ntcBeta);
  }

  function linearizeTempC(raw, tag) {
    const mode = normalizeLinearize(tag.linearize);
    if (mode === 'opta_ntc_divider') return optaNtcDividerTempC(raw, tag);
    if (mode === 'ntc_divider') return ntcDividerTempC(raw, tag);
    return null;
  }

  function linearizeTempCToRaw(tempC, tag) {
    const target = Number(tempC);
    if (!Number.isFinite(target)) return null;
    const mode = normalizeLinearize(tag.linearize);
    const adcMax = mode === 'opta_ntc_divider'
      ? normalizeOptaNtcParams(tag).adcMax
      : normalizeNtcParams(tag).adcMax;
    let bestRaw = null;
    let bestErr = Infinity;
    for (let raw = 1; raw <= adcMax; raw++) {
      const t = linearizeTempC(raw, tag);
      if (t == null) continue;
      const err = Math.abs(t - target);
      if (err < bestErr) {
        bestErr = err;
        bestRaw = raw;
      }
    }
    return bestErr < 3 ? bestRaw : null;
  }

  function twoPointToScaleOffset(rawLo, engLo, rawHi, engHi) {
    const r0 = Number(rawLo);
    const r1 = Number(rawHi);
    const e0 = Number(engLo);
    const e1 = Number(engHi);
    if (![r0, r1, e0, e1].every(Number.isFinite)) return null;
    if (r1 === r0) return null;
    const scale = (e1 - e0) / (r1 - r0);
    if (!Number.isFinite(scale) || scale === 0) return null;
    return { scale, offset: e0 - r0 * scale };
  }

  function rawFromStoredValue(tag, storedValue) {
    const v = Number(storedValue);
    if (!Number.isFinite(v)) return null;
    const mode = normalizeLinearize(tag.linearize);
    if (mode === 'ntc_divider' || mode === 'opta_ntc_divider') {
      const scale = Number(tag.scale) || 1;
      const offset = Number(tag.offset) || 0;
      const tempC = (v - offset) / scale;
      return linearizeTempCToRaw(tempC, tag);
    }
    const scale = Number(tag.scale);
    const offset = Number(tag.offset);
    const s = Number.isFinite(scale) && scale !== 0 ? scale : 1;
    const o = Number.isFinite(offset) ? offset : 0;
    if (s === 1 && o === 0) return Math.round(v);
    return Math.round((v - o) / s);
  }

  function previewEngineering(tag, raw) {
    const t = linearizeTempC(raw, tag);
    if (t == null) {
      const scale = Number(tag.scale) || 1;
      const offset = Number(tag.offset) || 0;
      return Number(raw) * scale + offset;
    }
    const scale = Number(tag.scale) || 1;
    const offset = Number(tag.offset) || 0;
    return t * scale + offset;
  }

  return {
    normalizeLinearize,
    normalizeEngUnit,
    ntcDisplayScaleOffset,
    inferNtcEngUnit,
    ntcTrimFromTag,
    celsiusToFahrenheit,
    normalizeNtcParams,
    normalizeOptaNtcParams,
    ntcDividerTempC,
    optaNtcDividerTempC,
    linearizeTempC,
    twoPointToScaleOffset,
    rawFromStoredValue,
    previewEngineering,
  };
})();

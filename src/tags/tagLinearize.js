'use strict';

const LINEARIZE_TYPES = new Set(['none', 'ntc_divider', 'opta_ntc_divider']);

function normalizeEngUnit(unit) {
  return unit === 'F' ? 'F' : 'C';
}

/** Display scale/offset after NTC linearize (curve always in °C). */
function ntcDisplayScaleOffset(engUnit, trim = 0) {
  const u = normalizeEngUnit(engUnit);
  const t = Number(trim);
  const trimN = Number.isFinite(t) ? t : 0;
  if (u === 'F') return { scale: 1.8, offset: 32 + trimN };
  return { scale: 1, offset: trimN };
}

function inferNtcEngUnit(tag = {}) {
  if (tag.engUnit === 'F' || tag.engUnit === 'C') return tag.engUnit;
  const s = Number(tag.scale);
  const o = Number(tag.offset);
  if (Number.isFinite(s) && Math.abs(s - 1.8) < 0.05 && Number.isFinite(o) && o >= 28) return 'F';
  return 'C';
}

function ntcTrimFromTag(tag = {}) {
  const unit = inferNtcEngUnit(tag);
  const o = Number(tag.offset) || 0;
  return unit === 'F' ? o - 32 : o;
}

function celsiusToFahrenheit(c) {
  return c * 1.8 + 32;
}

function fahrenheitToCelsius(f) {
  return (f - 32) / 1.8;
}

function normalizeLinearize(value) {
  const t = String(value || 'none').toLowerCase();
  return LINEARIZE_TYPES.has(t) ? t : 'none';
}

function normalizeNtcParams(tag = {}) {
  return {
    adcMax: Number.isFinite(Number(tag.adcMax)) && Number(tag.adcMax) > 0 ? Number(tag.adcMax) : 1023,
    vRef: Number.isFinite(Number(tag.vRef)) && Number(tag.vRef) > 0 ? Number(tag.vRef) : 10,
    rFixed: Number.isFinite(Number(tag.rFixed)) && Number(tag.rFixed) > 0 ? Number(tag.rFixed) : 10000,
    ntcR25: Number.isFinite(Number(tag.ntcR25)) && Number(tag.ntcR25) > 0 ? Number(tag.ntcR25) : 10000,
    ntcBeta: Number.isFinite(Number(tag.ntcBeta)) && Number(tag.ntcBeta) > 0 ? Number(tag.ntcBeta) : 3950,
  };
}

function normalizeOptaNtcParams(tag = {}) {
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

/** Simple divider: Vref → R_ntc → Vout → R_fixed → GND (lower ADC = hotter). */
function ntcDividerTempC(raw, tag = {}) {
  const { adcMax, vRef, rFixed, ntcR25, ntcBeta } = normalizeNtcParams(tag);
  const adc = Number(raw);
  if (!Number.isFinite(adc) || adc <= 0) return null;
  const v = (adc / adcMax) * vRef;
  if (v <= 0.001 || v >= vRef - 0.001) return null;
  const rNtc = rFixed * ((vRef / v) - 1);
  return betaNtcTempC(rNtc, ntcR25, ntcBeta);
}

/**
 * Opta 24 VDC divider (firmware/thermistor info.c):
 * V_supply → R_fixed → node (0–10 V ADC) → NTC ∥ R_opta_internal → GND
 */
function optaNtcDividerTempC(raw, tag = {}) {
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
  const rThermistor = 1 / invTherm;
  return betaNtcTempC(rThermistor, ntcR25, ntcBeta);
}

function linearizeTempC(raw, tag = {}) {
  const mode = normalizeLinearize(tag.linearize);
  if (mode === 'opta_ntc_divider') return optaNtcDividerTempC(raw, tag);
  if (mode === 'ntc_divider') return ntcDividerTempC(raw, tag);
  return null;
}

/** Approximate inverse: scan ADC for closest °C (capture / preview). */
function linearizeTempCToRaw(tempC, tag = {}) {
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

function applyLinearize(raw, tag = {}) {
  const t = linearizeTempC(raw, tag);
  return t == null ? raw : t;
}

function normalizeLinearizeFields(src = {}) {
  const linearize = normalizeLinearize(src.linearize);
  if (linearize === 'opta_ntc_divider') {
    const p = normalizeOptaNtcParams(src);
    return {
      linearize: 'opta_ntc_divider',
      adcMax: p.adcMax,
      adcMaxVoltage: p.adcMaxVoltage,
      vSupply: p.vSupply,
      rFixed: p.rFixed,
      rOptaInternal: p.rOptaInternal,
      ntcR25: p.ntcR25,
      ntcBeta: p.ntcBeta,
    };
  }
  if (linearize === 'ntc_divider') {
    const p = normalizeNtcParams(src);
    return {
      linearize: 'ntc_divider',
      adcMax: p.adcMax,
      vRef: p.vRef,
      rFixed: p.rFixed,
      ntcR25: p.ntcR25,
      ntcBeta: p.ntcBeta,
    };
  }
  return src.linearize ? { linearize: 'none' } : {};
}

function formatLinearizeLabel(tag = {}) {
  const mode = normalizeLinearize(tag.linearize);
  if (mode === 'opta_ntc_divider') {
    const p = normalizeOptaNtcParams(tag);
    return `Opta NTC ${Math.round(p.vSupply)}V`;
  }
  if (mode === 'ntc_divider') {
    const p = normalizeNtcParams(tag);
    return `NTC ${Math.round(p.ntcR25 / 1000)}K β${p.ntcBeta}`;
  }
  return '';
}

module.exports = {
  LINEARIZE_TYPES,
  normalizeLinearize,
  normalizeEngUnit,
  ntcDisplayScaleOffset,
  inferNtcEngUnit,
  ntcTrimFromTag,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  normalizeNtcParams,
  normalizeOptaNtcParams,
  normalizeLinearizeFields,
  ntcDividerTempC,
  optaNtcDividerTempC,
  linearizeTempC,
  linearizeTempCToRaw,
  applyLinearize,
  formatLinearizeLabel,
};

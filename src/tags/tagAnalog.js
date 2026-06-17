'use strict';

const NUMERIC_TAG_TYPES = new Set(['INT', 'REAL']);

const ALARM_LEVELS = {
  OUTER_LOW: 'outerLow',
  INNER_LOW: 'innerLow',
  NORMAL: 'normal',
  INNER_HIGH: 'innerHigh',
  OUTER_HIGH: 'outerHigh',
};

const DIGITAL_ALARM_CONDITIONS = new Set(['on', 'off']);

const ALARM_LABELS = {
  outerLow: 'Outer low',
  innerLow: 'Inner low',
  normal: 'Normal',
  innerHigh: 'Inner high',
  outerHigh: 'Outer high',
  alarm: 'Alarm',
};

function isNumericTagType(type) {
  return NUMERIC_TAG_TYPES.has(String(type || '').toUpperCase());
}

function isDigitalTagType(type) {
  return String(type || '').toUpperCase() === 'BOOL';
}

function isAlarmCapableType(type) {
  return isNumericTagType(type) || isDigitalTagType(type);
}

function normalizeScale(scale) {
  const n = Number(scale);
  return Number.isFinite(n) && n !== 0 ? n : 1;
}

function normalizeOffset(offset) {
  const n = Number(offset);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAlarmLimit(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAlarmCondition(value) {
  const v = String(value || '').toLowerCase();
  return DIGITAL_ALARM_CONDITIONS.has(v) ? v : null;
}

function normalizeAlarmFields(src = {}) {
  return {
    alarmsEnabled: !!src.alarmsEnabled,
    alarmOuterLow: normalizeAlarmLimit(src.alarmOuterLow),
    alarmInnerLow: normalizeAlarmLimit(src.alarmInnerLow),
    alarmInnerHigh: normalizeAlarmLimit(src.alarmInnerHigh),
    alarmOuterHigh: normalizeAlarmLimit(src.alarmOuterHigh),
    alarmCondition: normalizeAlarmCondition(src.alarmCondition),
  };
}

function scaleRawToEng(raw, tag) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n * normalizeScale(tag?.scale) + normalizeOffset(tag?.offset);
}

function scaleEngToRaw(eng, tag) {
  const n = Number(eng);
  if (!Number.isFinite(n)) return eng;
  const scale = normalizeScale(tag?.scale);
  return Math.round((n - normalizeOffset(tag?.offset)) / scale);
}

function alarmLimitsValid(tag) {
  if (!tag?.alarmsEnabled || !isNumericTagType(tag.type)) return false;
  const ol = tag.alarmOuterLow;
  const il = tag.alarmInnerLow;
  const ih = tag.alarmInnerHigh;
  const oh = tag.alarmOuterHigh;
  if (ol == null || il == null || ih == null || oh == null) return false;
  return ol <= il && il <= ih && ih <= oh;
}

function digitalAlarmActive(tag, value) {
  if (!tag?.alarmsEnabled || !isDigitalTagType(tag.type) || !tag.alarmCondition) return false;
  const on = !!value;
  if (tag.alarmCondition === 'on') return on;
  if (tag.alarmCondition === 'off') return !on;
  return false;
}

function isAlarmActive(level) {
  return !!level && level !== ALARM_LEVELS.NORMAL;
}

function evaluateAlarmLevel(tag, value = tag?.value) {
  if (!tag?.alarmsEnabled || !isAlarmCapableType(tag.type)) return null;
  if (isDigitalTagType(tag.type)) {
    if (!tag.alarmCondition) return null;
    return digitalAlarmActive(tag, value) ? 'alarm' : ALARM_LEVELS.NORMAL;
  }
  if (!alarmLimitsValid(tag)) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (v < tag.alarmOuterLow) return ALARM_LEVELS.OUTER_LOW;
  if (v < tag.alarmInnerLow) return ALARM_LEVELS.INNER_LOW;
  if (v <= tag.alarmInnerHigh) return ALARM_LEVELS.NORMAL;
  if (v <= tag.alarmOuterHigh) return ALARM_LEVELS.INNER_HIGH;
  return ALARM_LEVELS.OUTER_HIGH;
}

function formatScaleLabel(tag) {
  if (!isNumericTagType(tag?.type)) return '—';
  const scale = normalizeScale(tag.scale);
  const offset = normalizeOffset(tag.offset);
  const offStr = offset >= 0 ? `+${offset}` : String(offset);
  if (scale === 1 && offset === 0) return '×1';
  return `×${scale} ${offStr}`;
}

function formatAlarmLimitsLabel(tag) {
  if (!tag?.alarmsEnabled || !isNumericTagType(tag.type)) return 'off';
  const parts = [
    tag.alarmOuterLow,
    tag.alarmInnerLow,
    tag.alarmInnerHigh,
    tag.alarmOuterHigh,
  ];
  if (parts.some((p) => p == null)) return 'incomplete';
  return parts.map((p) => String(p)).join(' / ');
}

module.exports = {
  NUMERIC_TAG_TYPES,
  DIGITAL_ALARM_CONDITIONS,
  ALARM_LEVELS,
  ALARM_LABELS,
  isNumericTagType,
  isDigitalTagType,
  isAlarmCapableType,
  normalizeScale,
  normalizeOffset,
  normalizeAlarmLimit,
  normalizeAlarmCondition,
  normalizeAlarmFields,
  scaleRawToEng,
  scaleEngToRaw,
  alarmLimitsValid,
  digitalAlarmActive,
  evaluateAlarmLevel,
  isAlarmActive,
  formatScaleLabel,
  formatAlarmLimitsLabel,
};

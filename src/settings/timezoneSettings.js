'use strict';

/** Workspace default — Eastern Time (handles EST/EDT). */
const DEFAULT_TIMEZONE = 'America/New_York';

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
  'UTC',
];

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function normalizeTimezone(input, prev) {
  const raw = input != null ? String(input).trim() : '';
  if (raw && isValidTimeZone(raw)) return raw;
  const prevTz = prev != null ? String(prev).trim() : '';
  if (prevTz && isValidTimeZone(prevTz)) return prevTz;
  return DEFAULT_TIMEZONE;
}

/**
 * Minutes to add to local wall time to get UTC — same sign as Date#getTimezoneOffset().
 * EST → 300, EDT → 240, UTC → 0.
 */
function getTimezoneOffsetMinutes(timeZone, date = new Date()) {
  const tz = normalizeTimezone(timeZone);
  const d = date instanceof Date ? date : new Date(date);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((d.getTime() - asUtc) / 60000);
}

function zonedParts(timeZone, date = new Date()) {
  const tz = normalizeTimezone(timeZone);
  const d = date instanceof Date ? date : new Date(date);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const parts = {};
  for (const p of dtf.formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const weekdayMap = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayMap[parts.weekday] ?? d.getUTCDay(),
  };
}

function formatInTimezone(date = new Date(), timeZone = DEFAULT_TIMEZONE, opts = {}) {
  const tz = normalizeTimezone(timeZone);
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const withMs = opts.ms === true;
  const p = zonedParts(tz, d);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  let out = `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  if (withMs) out += `.${pad(d.getUTCMilliseconds(), 3)}`;
  return out;
}

function readTimezoneFromSettings(settings) {
  return normalizeTimezone(settings?.timezone);
}

function resolveTimezone(persistence) {
  try {
    if (!persistence?.readJson) return DEFAULT_TIMEZONE;
    return readTimezoneFromSettings(persistence.readJson('settings.json', {}));
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

module.exports = {
  DEFAULT_TIMEZONE,
  COMMON_TIMEZONES,
  isValidTimeZone,
  normalizeTimezone,
  getTimezoneOffsetMinutes,
  zonedParts,
  formatInTimezone,
  readTimezoneFromSettings,
  resolveTimezone,
};

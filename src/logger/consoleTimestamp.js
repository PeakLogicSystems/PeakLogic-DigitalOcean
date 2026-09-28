'use strict';

const {
  DEFAULT_TIMEZONE,
  normalizeTimezone,
  formatInTimezone,
} = require('../settings/timezoneSettings');

let displayTimezone = DEFAULT_TIMEZONE;

function setConsoleTimezone(tz) {
  displayTimezone = normalizeTimezone(tz);
  return displayTimezone;
}

function getConsoleTimezone() {
  return displayTimezone;
}

/** Wall-clock timestamp for console prefixes (YYYY-MM-DD HH:MM:SS.mmm) in workspace TZ. */
function formatConsoleTimestamp(date = new Date()) {
  const base = formatInTimezone(date, displayTimezone);
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${base}.${ms}`;
}

let installed = false;

/** Prefix console.log/info/warn/error/debug with a timestamp. Idempotent. */
function installConsoleTimestamp() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level]?.bind(console);
    if (!original) continue;
    console[level] = (...args) => {
      original(`[${formatConsoleTimestamp()}]`, ...args);
    };
  }
}

module.exports = {
  formatConsoleTimestamp,
  installConsoleTimestamp,
  setConsoleTimezone,
  getConsoleTimezone,
};

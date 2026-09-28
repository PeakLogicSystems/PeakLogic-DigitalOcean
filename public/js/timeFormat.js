'use strict';

/** Workspace display timezone — default Eastern (America/New_York). */
window.PeaklogicTime = (function initPeaklogicTime() {
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

  let timeZone = DEFAULT_TIMEZONE;

  function isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  function setTimezone(tz) {
    const next = String(tz || '').trim();
    timeZone = isValidTimeZone(next) ? next : DEFAULT_TIMEZONE;
    return timeZone;
  }

  function getTimezone() {
    return timeZone;
  }

  function toDate(value) {
    if (value instanceof Date) return value;
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function zonedParts(d) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
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
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour,
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  function pad(n, w = 2) {
    return String(n).padStart(w, '0');
  }

  /** Log / table style: YYYY-MM-DD HH:mm:ss in workspace timezone. */
  function formatDateTime(value) {
    const d = toDate(value);
    if (!d) {
      const s = String(value || '');
      return s ? s.slice(0, 19).replace('T', ' ') : '';
    }
    const p = zonedParts(d);
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  }

  /** Live I/O style: HH:mm:ss.mmm in workspace timezone. */
  function formatClockMs(value) {
    const d = toDate(value);
    if (!d) return '—';
    const p = zonedParts(d);
    return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(d.getMilliseconds(), 3)}`;
  }

  /** Friendly project list style. */
  function formatFriendly(value) {
    const d = toDate(value);
    if (!d) return '';
    return d.toLocaleString(undefined, {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function localeOpts(extra = {}) {
    return { timeZone, ...extra };
  }

  function optionsHtml(selected) {
    const sel = isValidTimeZone(selected) ? selected : DEFAULT_TIMEZONE;
    const zones = COMMON_TIMEZONES.slice();
    if (!zones.includes(sel)) zones.unshift(sel);
    return zones.map((z) => {
      const label = z === 'America/New_York' ? 'America/New_York (Eastern)' : z;
      return `<option value="${z}"${z === sel ? ' selected' : ''}>${label}</option>`;
    }).join('');
  }

  return {
    DEFAULT_TIMEZONE,
    COMMON_TIMEZONES,
    setTimezone,
    getTimezone,
    isValidTimeZone,
    formatDateTime,
    formatClockMs,
    formatFriendly,
    localeOpts,
    optionsHtml,
  };
}());

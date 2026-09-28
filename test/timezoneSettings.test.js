'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_TIMEZONE,
  normalizeTimezone,
  getTimezoneOffsetMinutes,
  zonedParts,
  formatInTimezone,
  readTimezoneFromSettings,
} = require('../src/settings/timezoneSettings');

describe('timezoneSettings', () => {
  it('defaults to America/New_York', () => {
    assert.equal(DEFAULT_TIMEZONE, 'America/New_York');
    assert.equal(normalizeTimezone(undefined), 'America/New_York');
    assert.equal(normalizeTimezone(''), 'America/New_York');
    assert.equal(normalizeTimezone('Not/AZone'), 'America/New_York');
    assert.equal(readTimezoneFromSettings({}), 'America/New_York');
  });

  it('accepts valid IANA zones', () => {
    assert.equal(normalizeTimezone('America/Chicago'), 'America/Chicago');
    assert.equal(normalizeTimezone('UTC'), 'UTC');
    assert.equal(normalizeTimezone('bogus', 'America/Denver'), 'America/Denver');
  });

  it('computes JS-style offsets for Eastern', () => {
    const summer = new Date('2026-06-20T18:00:00.000Z');
    const winter = new Date('2026-01-15T18:00:00.000Z');
    assert.equal(getTimezoneOffsetMinutes('America/New_York', summer), 240);
    assert.equal(getTimezoneOffsetMinutes('America/New_York', winter), 300);
    assert.equal(getTimezoneOffsetMinutes('UTC', summer), 0);
  });

  it('formats wall clock in configured zone', () => {
    const instant = new Date('2026-01-15T18:30:00.000Z');
    assert.equal(formatInTimezone(instant, 'America/New_York'), '2026-01-15 13:30:00');
    assert.equal(formatInTimezone(instant, 'UTC'), '2026-01-15 18:30:00');
    const parts = zonedParts('America/New_York', instant);
    assert.equal(parts.hour, 13);
    assert.equal(parts.minute, 30);
  });
});

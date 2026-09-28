'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  normalizeProfile,
  shouldNotifyForLevel,
  isWithinQuietHours,
} = require('../src/users/userProfileSchema');

describe('userProfileSchema', () => {
  it('normalizes profile and alarm notification fields', () => {
    const p = normalizeProfile({
      displayName: ' Roy ',
      phone: '555-0100',
      alarmNotifications: { sms: true, minLevel: 'outer', emailAddress: 'alerts@test.com' },
    }, { email: 'roy@test.com' });
    assert.equal(p.displayName, 'Roy');
    assert.equal(p.phone, '555-0100');
    assert.equal(p.alarmNotifications.sms, true);
    assert.equal(p.alarmNotifications.minLevel, 'outer');
    assert.equal(p.alarmNotifications.emailAddress, 'alerts@test.com');
  });

  it('filters alarm levels by minLevel', () => {
    const n = { enabled: true, minLevel: 'outer' };
    assert.equal(shouldNotifyForLevel(n, 'innerHigh'), false);
    assert.equal(shouldNotifyForLevel(n, 'outerHigh'), true);
  });

  it('detects quiet hours window', () => {
    const n = { quietHours: { enabled: true, start: '22:00', end: '07:00' } };
    const late = new Date('2026-01-15T23:30:00');
    const midday = new Date('2026-01-15T12:00:00');
    assert.equal(isWithinQuietHours(n, late), true);
    assert.equal(isWithinQuietHours(n, midday), false);
  });
});

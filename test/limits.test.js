'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { checkCreateLimit, tenantLimits } = require('../src/services/limits');

describe('tenant hierarchy limits', () => {
  it('uses tenant overrides when set', () => {
    const limits = tenantLimits({
      maxLocations: 10,
      maxSystemsPerLocation: 20,
      maxDevicesPerSystem: 30,
    });
    assert.equal(limits.locations, 10);
    assert.equal(limits.systemsPerLocation, 20);
    assert.equal(limits.devicesPerSystem, 30);
  });

  it('blocks create at max count', () => {
    const r = checkCreateLimit(1000, 1000, 'Location');
    assert.equal(r.ok, false);
    assert.match(r.error, /Location limit reached/);
  });

  it('allows create below max', () => {
    const r = checkCreateLimit(999, 1000, 'Device');
    assert.equal(r.ok, true);
    assert.equal(r.remaining, 0);
  });
});

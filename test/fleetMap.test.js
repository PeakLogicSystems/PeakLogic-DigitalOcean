'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FLORIDA_COUNTIES, countyBySlug } = require('../src/fleet/floridaCounties');
const { latLngToPercent } = require('../src/fleet/mapProjection');

describe('florida fleet map', () => {
  it('lists all 67 Florida counties', () => {
    assert.equal(FLORIDA_COUNTIES.length, 67);
    const slugs = new Set(FLORIDA_COUNTIES.map((c) => c.slug));
    assert.equal(slugs.size, 67);
  });

  it('projects county centroids to map percents', () => {
    const pasco = countyBySlug('pasco');
    assert.ok(pasco);
    const pos = latLngToPercent(pasco.lat, pasco.lng);
    assert.ok(pos.x > 0 && pos.x < 100);
    assert.ok(pos.y > 0 && pos.y < 100);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  explodeCompositeToEdit,
  listHmiComposites,
  compositeBindingElementId,
} = require('../src/hmi/hmiComposites');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

describe('triplex lift station HMI', () => {
  it('lists triplexls composite with pump 3 bindings', () => {
    const manifest = listHmiComposites(PUBLIC)
      .find((c) => c.composite?.id === 'triplexls')?.composite;
    assert.ok(manifest, 'triplexls composite');
    assert.equal(manifest.parts[0].svg, '/hmi/svg/library/lift-station-faceplates/peaklogic/triplexls.svg');
    assert.ok(manifest.defaultBindings.some((b) => b.elementId === 'btn_p3_start'));
    assert.ok(manifest.defaultBindings.some((b) => b.elementId === 'lamp_float_lag2'));
    assert.ok(manifest.tagRoles.motor3Run);
  });

  it('triplexls svg includes three pump columns', () => {
    const svg = fs.readFileSync(
      path.join(PUBLIC, 'hmi/svg/library/lift-station-faceplates/peaklogic/triplexls.svg'),
      'utf8',
    );
    assert.match(svg, /TRIPLEXLS/);
    assert.match(svg, /PUMP MOTOR 3/);
    assert.match(svg, /lamp_float_lag2/);
  });

  it('prefixed triplex bindings map to YELV_ tags', () => {
    const manifest = listHmiComposites(PUBLIC)
      .find((c) => c.composite?.id === 'triplexls')?.composite;
    const p3Start = manifest.defaultBindings.find((b) => b.elementId === 'btn_p3_start');
    const elementId = compositeBindingElementId(0, 0, manifest, p3Start);
    assert.equal(manifest.tagRoles[p3Start.tagRole].tagId, 'MOTOR3_START');
    assert.ok(elementId.includes('btn_p3_start'));
  });
});

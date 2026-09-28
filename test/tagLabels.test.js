'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { defaultLabelForId, applyDefaultLabel } = require('../src/tags/tagLabels');
const { loadFixtureBundle } = require('../src/programs/programFixtures');

describe('tagLabels', () => {
  it('infers motor and VPB labels', () => {
    assert.equal(defaultLabelForId('MOTOR1_HOA'), 'Motor 1 HOA mode');
    assert.equal(defaultLabelForId('MOTOR1_RUN'), 'Motor 1 run output');
    assert.equal(defaultLabelForId('VPB1'), 'VPB permissive');
  });

  it('applyDefaultLabel skips existing labels', () => {
    const out = applyDefaultLabel({ id: 'MOTOR1_START', label: 'Custom' });
    assert.equal(out.label, 'Custom');
  });
});

describe('motor fixture labels', () => {
  it('loads motor_hoa tags with labels', () => {
    const bundle = loadFixtureBundle('logic/22_motor_hoa.st', []);
    assert.ok(bundle);
    const hoa = bundle.tags.find((t) => t.id === 'MOTOR1_HOA');
    assert.equal(hoa?.label, 'Motor 1 HOA mode');
    assert.equal(bundle.tags.find((t) => t.id === 'VPB1')?.label, 'VPB permissive');
  });
});

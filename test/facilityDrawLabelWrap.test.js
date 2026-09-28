'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { wrapLabel, wrapLabelText } = require('../facility-draw/src/labelWrap');

describe('facilityDraw label wrap', () => {
  it('keeps short labels on one line', () => {
    assert.deepEqual(wrapLabel('Tank 1'), ['Tank 1']);
    assert.equal(wrapLabelText('Septic'), 'Septic');
  });

  it('wraps labels longer than 8 characters', () => {
    const lines = wrapLabel('Duplex lift station');
    assert.ok(lines.length > 1);
    assert.ok(lines.every((l) => l.length <= 8));
    assert.equal(lines.join(' '), 'Duplex lift station');
  });

  it('hard-splits long tokens without spaces', () => {
    const lines = wrapLabel('ABCDEFGHIJ');
    assert.deepEqual(lines, ['ABCDEFGH', 'IJ']);
  });

  it('wraps symbol default labels for readability', () => {
    const lines = wrapLabel('Trash tank 1,250 gal (2-compartment)');
    assert.ok(lines.length >= 3);
    assert.ok(lines.every((l) => l.length <= 8));
  });
});

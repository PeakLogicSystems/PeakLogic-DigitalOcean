'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  extentsFromSheet,
  worldSizeFromSheet,
  pdfPagePoints,
  formatSheetDescription,
} = require('../facility-draw/src/sheetSizes');
const { normalizeExtents } = require('../facility-draw/src/extents');

describe('facilityDraw sheet sizes', () => {
  it('maps Arch D to world feet at 10 ft/in', () => {
    const size = worldSizeFromSheet('D', 'ft', 10);
    assert.equal(size.width, 360);
    assert.equal(size.height, 240);
  });

  it('builds centered extents for sheet B', () => {
    const ext = extentsFromSheet('B', 50, 25, { units: 'ft', worldPerInch: 10 });
    assert.equal(ext.maxX - ext.minX, 180);
    assert.equal(ext.maxY - ext.minY, 120);
    assert.equal(ext.sheetSize, 'B');
    assert.equal(ext.minX, 50 - 90);
    assert.equal(ext.maxY, 25 + 60);
  });

  it('normalizes extents with sheet metadata', () => {
    const ext = normalizeExtents({
      minX: 0,
      minY: 0,
      maxX: 360,
      maxY: 240,
      sheetSize: 'D',
      worldPerInch: 10,
    });
    assert.equal(ext.sheetSize, 'D');
    assert.equal(ext.worldPerInch, 10);
  });

  it('provides PDF page points for Arch C landscape', () => {
    const pts = pdfPagePoints('C');
    assert.equal(pts.width, 24 * 72);
    assert.equal(pts.height, 18 * 72);
  });

  it('swaps Arch C page points for portrait', () => {
    const pts = pdfPagePoints('C', 'portrait');
    assert.equal(pts.width, 18 * 72);
    assert.equal(pts.height, 24 * 72);
  });

  it('normalizes orientation aliases', () => {
    const { normalizeOrientation } = require('../facility-draw/src/sheetSizes');
    assert.equal(normalizeOrientation('portrait'), 'portrait');
    assert.equal(normalizeOrientation('P'), 'portrait');
    assert.equal(normalizeOrientation('landscape'), 'landscape');
    assert.equal(normalizeOrientation('', 'portrait'), 'portrait');
  });

  it('formats sheet description', () => {
    const s = formatSheetDescription('A', 'ft', 10);
    assert.match(s, /Arch A/);
    assert.match(s, /120×90 ft/);
  });
});

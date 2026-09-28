'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadHmiView() {
  const src = fs.readFileSync(path.join(__dirname, '../public/js/hmi.js'), 'utf8');
  const sandbox = { global: {}, window: {}, document: { createElement: () => ({ style: {}, appendChild() {}, classList: { add() {}, remove() {} } }) } };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'hmi.js' });
  return sandbox.HmiView;
}

describe('bindingElementTargetsCell', () => {
  const HmiView = loadHmiView();
  const { bindingElementTargetsCell, parseCellElementId } = HmiView;

  it('matches cell from tN_M_zZ__suffix id', () => {
    assert.equal(bindingElementTargetsCell('t10_4_z1__flash_overlay', 9, 3), true);
    assert.equal(bindingElementTargetsCell('t10_4_z1__flash_overlay', 0, 0), false);
  });

  it('parseCellElementId maps display coords to 0-based col/row', () => {
    const parsed = parseCellElementId('t10_4_z1__flash_overlay');
    assert.equal(parsed.col, 9);
    assert.equal(parsed.row, 3);
    assert.equal(parsed.z, 1);
    assert.equal(parsed.suffix, 'flash_overlay');
  });
});

describe('pageHotspotRegion', () => {
  const HmiView = loadHmiView();
  const { pageHotspotRegion } = HmiView;

  it('uses hotspotColSpan/hotspotRowSpan instead of full tile span', () => {
    const layer = {
      kind: 'pageHotspot',
      targetScreenId: 'screen_2',
      hotspotCol: 0,
      hotspotRow: 0,
      hotspotColSpan: 9,
    };
    const region = pageHotspotRegion(layer, 0, 0, 10, 10);
    assert.equal(region.col, 0);
    assert.equal(region.row, 0);
    assert.equal(region.colSpan, 9);
    assert.equal(region.rowSpan, 1);
  });

  it('defaults rowSpan to 1 when only hotspotColSpan is set on a large tile', () => {
    const layer = {
      kind: 'pageHotspot',
      targetScreenId: 'screen_2',
      hotspotColSpan: 9,
    };
    const region = pageHotspotRegion(layer, 0, 0, 10, 10);
    assert.equal(region.colSpan, 9);
    assert.equal(region.rowSpan, 1);
  });

  it('falls back to tile span for legacy hotspots without region fields', () => {
    const layer = { kind: 'pageHotspot', targetScreenId: 'screen_2' };
    const region = pageHotspotRegion(layer, 0, 0, 10, 10);
    assert.equal(region.colSpan, 10);
    assert.equal(region.rowSpan, 10);
  });

  it('supports flashOverlay region fields the same as pageHotspot', () => {
    const layer = {
      kind: 'flashOverlay',
      color: 'red',
      hotspotCol: 2,
      hotspotRow: 1,
      hotspotColSpan: 3,
      hotspotRowSpan: 2,
    };
    const region = pageHotspotRegion(layer, 0, 0, 8, 6);
    assert.equal(region.col, 2);
    assert.equal(region.row, 1);
    assert.equal(region.colSpan, 3);
    assert.equal(region.rowSpan, 2);
  });
});

describe('applyPageHotspotLayerBounds', () => {
  const HmiView = loadHmiView();
  const { applyPageHotspotLayerBounds } = HmiView;

  function boundsForLayer(layer, tileColSpan = 1, tileRowSpan = 1) {
    const layerEl = { style: {} };
    applyPageHotspotLayerBounds(layerEl, layer, 0, 0, tileColSpan, tileRowSpan);
    return layerEl.style;
  }

  it('centers a 50% flash overlay within a spanned region', () => {
    const style = boundsForLayer({
      kind: 'flashOverlay',
      color: 'red',
      hotspotColSpan: 2,
      hotspotRowSpan: 2,
      cellFraction: 0.5,
    }, 4, 4);
    assert.equal(style.left, '12.5%');
    assert.equal(style.top, '12.5%');
    assert.equal(style.width, '25%');
    assert.equal(style.height, '25%');
  });

  it('uses full region when cellFraction is omitted', () => {
    const style = boundsForLayer({
      kind: 'pageHotspot',
      targetScreenId: 'screen_2',
      hotspotColSpan: 2,
      hotspotRowSpan: 1,
    }, 4, 4);
    assert.equal(style.left, '0%');
    assert.equal(style.top, '0%');
    assert.equal(style.width, '50%');
    assert.equal(style.height, '25%');
  });
});

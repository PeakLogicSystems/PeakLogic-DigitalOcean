'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { repairCompositeBindings } = require('../src/hmi/hmiComposites');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function loadHmiView() {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/hmi.js'), 'utf8');
  const sandbox = { global: {}, window: {}, document: { createElement: () => ({ style: {}, appendChild() {}, classList: { add() {}, remove() {} } }) } };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'hmi.js' });
  return sandbox.HmiView;
}

function makeLiftStationGrid() {
  const svgNs = 'http://www.w3.org/2000/svg';
  const grid = {
    classList: { contains: (c) => c === 'hmi-tile-grid' },
    querySelector(sel) {
      if (sel.includes('data-col="0"') && sel.includes('data-row="0"')) return cell;
      if (sel.includes('hmi-tile-grid')) return grid;
      return null;
    },
    contains() { return true; },
  };
  const cell = {
    dataset: { col: '0', row: '0' },
    querySelector(sel) {
      if (sel.includes('data-z="0"')) return layer;
      return null;
    },
  };
  const layer = {
    dataset: { z: '0' },
    querySelector(sel) {
      if (sel.includes('svg')) return svg;
      return null;
    },
  };
  const svg = {
    dataset: { hmiAssetPath: '/hmi/svg/library/lift-station-faceplates/peaklogic/duplexls.svg' },
    namespaceURI: svgNs,
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        return nodes.find((n) => n.id === id) || null;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[id]') return nodes.filter((n) => n.id);
      return [];
    },
  };
  const nodes = [];
  function node(id, tagName = 'rect') {
    const el = {
      id,
      tagName,
      namespaceURI: svgNs,
      style: {},
      classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
      dataset: {},
      parentElement: svg,
      ownerSVGElement: svg,
      closest(sel) {
        if (String(sel || '').includes('svg')) return svg;
        if (String(sel || '').includes('hmi-tile-layer')) return layer;
        if (String(sel || '').includes('hmi-tile-cell')) return cell;
        return null;
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      setAttributeNS(_ns, name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] ?? ''; },
      attributes: id.includes('lamp_float') ? { r: '10' } : {},
    };
    nodes.push(el);
    return el;
  }
  node('t1_1_z0__lamp_float_lead', 'circle');
  node('t1_1_z0__ind_p1_running');
  node('t1_1_z0__ind_p1_stopped');
  node('t1_1_z0__txt_p1_running', 'text');
  node('t1_1_z0__txt_p1_stopped', 'text');
  node('t1_1_z0__btn_p1_auto');
  return { grid, get: (id) => nodes.find((n) => n.id === id) };
}

describe('duplex lift station indicator bindings', () => {
  const HmiView = loadHmiView();

  it('manifest includes run/stop bindings and no duty badge', () => {
    const hmi = {
      screens: [{ id: 'screen_2', tiles: [{ col: 0, row: 0, compositeId: 'duplexls', layers: [{ z: 0 }] }] }],
      bindings: [],
    };
    repairCompositeBindings(hmi, PUBLIC);
    const find = (suffix, property = 'fill') => hmi.bindings.find(
      (b) => b.screenId === 'screen_2' && b.elementId === `t1_1_z0__${suffix}` && b.property === property,
    );
    assert.equal(find('txt_p1_running')?.tagId, 'MOTOR1_RUN');
    assert.equal(find('txt_p1_stopped')?.tagId, 'MOTOR1_RUN');
    assert.equal(find('ind_p1_duty', 'fill5'), undefined);
    assert.equal(find('txt_p1_duty', 'text'), undefined);
    assert.equal(find('ind_p2_duty', 'fill5'), undefined);
    assert.equal(find('txt_p2_duty', 'text'), undefined);
  });

  it('applyBinding paints float lead lamp fill and stroke together', () => {
    const { get } = makeLiftStationGrid();
    const lamp = get('t1_1_z0__lamp_float_lead');
    assert.ok(lamp);
    const binding = {
      elementId: 't1_1_z0__lamp_float_lead',
      tagId: 'LVL_LEAD',
      property: 'fill',
      onValue: '#00ff00',
      offValue: '#333333',
    };
    HmiView.applyBinding(lamp, binding, { LVL_LEAD: { value: true } });
    assert.equal(lamp.getAttribute('fill'), '#00ff00');
    assert.equal(lamp.getAttribute('stroke'), '#00ff00');
    HmiView.applyBinding(lamp, binding, { LVL_LEAD: { value: false } });
    assert.equal(lamp.getAttribute('fill'), '#333333');
    assert.equal(lamp.getAttribute('stroke'), '#333333');
  });

  it('applyBinding highlights running/stopped rects and labels', () => {
    const { get } = makeLiftStationGrid();
    const runRect = get('t1_1_z0__ind_p1_running');
    const stopRect = get('t1_1_z0__ind_p1_stopped');
    const runText = get('t1_1_z0__txt_p1_running');
    const stopText = get('t1_1_z0__txt_p1_stopped');
    const liveOn = { MOTOR1_RUN: { value: true } };
    HmiView.applyBinding(runRect, { tagId: 'MOTOR1_RUN', property: 'fill', onValue: '#006600', offValue: '#222222' }, liveOn);
    HmiView.applyBinding(stopRect, { tagId: 'MOTOR1_RUN', property: 'fill', onValue: '#222222', offValue: '#cc0000' }, liveOn);
    HmiView.applyBinding(runText, { tagId: 'MOTOR1_RUN', property: 'fill', onValue: '#ffffff', offValue: '#555555' }, liveOn);
    HmiView.applyBinding(stopText, { tagId: 'MOTOR1_RUN', property: 'fill', onValue: '#555555', offValue: '#ffffff' }, liveOn);
    assert.equal(runRect.getAttribute('fill'), '#006600');
    assert.equal(stopRect.getAttribute('fill'), '#222222');
    assert.equal(runText.getAttribute('fill'), '#ffffff');
    assert.equal(stopText.getAttribute('fill'), '#555555');

    const liveOff = { MOTOR1_RUN: { value: false } };
    HmiView.applyBinding(runRect, { tagId: 'MOTOR1_RUN', property: 'fill', onValue: '#006600', offValue: '#222222' }, liveOff);
    HmiView.applyBinding(stopRect, { tagId: 'MOTOR1_RUN', property: 'fill', onValue: '#222222', offValue: '#cc0000' }, liveOff);
    HmiView.applyBinding(runText, { tagId: 'MOTOR1_RUN', property: 'fill', onValue: '#ffffff', offValue: '#555555' }, liveOff);
    HmiView.applyBinding(stopText, { tagId: 'MOTOR1_RUN', property: 'fill', onValue: '#555555', offValue: '#ffffff' }, liveOff);
    assert.equal(runRect.getAttribute('fill'), '#222222');
    assert.equal(stopRect.getAttribute('fill'), '#cc0000');
    assert.equal(runText.getAttribute('fill'), '#555555');
    assert.equal(stopText.getAttribute('fill'), '#ffffff');
  });

  it('applyBinding highlights the selected HOA button via fill5', () => {
    const { get } = makeLiftStationGrid();
    const auto = get('t1_1_z0__btn_p1_auto');
    const binding = {
      tagId: 'MOTOR1_HOA',
      elementId: 't1_1_z0__btn_p1_auto',
      property: 'fill5',
      interaction: 'hoaMode',
      hoaValue: 0,
      min: 0,
      max: 2,
      colors: ['#0044aa', '#333333', '#333333'],
    };
    HmiView.applyBinding(auto, binding, { MOTOR1_HOA: { type: 'INT', value: 0 } });
    assert.equal(auto.getAttribute('fill'), '#0044aa');
    HmiView.applyBinding(auto, binding, { MOTOR1_HOA: { type: 'INT', value: 2 } });
    assert.equal(auto.getAttribute('fill'), '#333333');
  });

  it('applyBinding maps STATION_STA to Online/Fault/Warning/Offline text', () => {
    const el = {
      tagName: 'text',
      id: 't1_1_z0__txt_station_status',
      style: {},
      classList: { contains: () => false },
      dataset: {},
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] ?? ''; },
      closest() { return null; },
    };
    const binding = {
      tagId: 'STATION_STA',
      elementId: 't1_1_z0__txt_station_status',
      property: 'text',
      format: 'stationSta',
      min: 0,
      max: 3,
      colors: ['#22c55e', '#ef4444', '#fbed20', '#64748b'],
    };
    const labels = ['ONLINE', 'FAULT', 'WARNING', 'OFFLINE'];
    for (let i = 0; i < labels.length; i += 1) {
      HmiView.applyBinding(el, binding, { STATION_STA: { type: 'INT', value: i } });
      assert.equal(el.textContent, labels[i]);
      assert.equal(el.getAttribute('fill'), binding.colors[i]);
    }
  });
});

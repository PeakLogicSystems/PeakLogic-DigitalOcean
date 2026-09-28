'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadHmiView() {
  const src = fs.readFileSync(path.join(__dirname, '../public/js/hmi.js'), 'utf8');
  const sandbox = {
    global: {},
    window: {},
    document: {
      createElement: () => ({
        style: {},
        appendChild() {},
        classList: { add() {}, remove() {} },
      }),
    },
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'hmi.js' });
  return sandbox.HmiView;
}

function makeGridWithStartButton() {
  const grid = {
    contains(el) { return el === rect || el === label || el === grid; },
    classList: { contains: () => false },
  };
  const rect = {
    id: 'btn_p1_start',
    tagName: 'rect',
    classList: { contains: (c) => c === 'hmi-bool-cmd-btn' },
    dataset: { boolCmdTagId: 'MOTOR1_START' },
    parentElement: grid,
    style: {},
  };
  const label = {
    tagName: 'text',
    classList: { contains: () => false },
    previousElementSibling: rect,
    parentElement: grid,
    style: {},
  };
  return { grid, rect, label };
}

describe('resolveBoolCommandFromEvent', () => {
  const HmiView = loadHmiView();
  const { resolveBoolCommandFromEvent, isBoolCommandBinding } = HmiView;

  const bindings = [
    {
      screenId: 'screen_2',
      elementId: 't1_1_z0__btn_p1_start',
      tagId: 'MOTOR1_START',
      property: 'fill',
      interaction: 'pulse',
    },
    {
      screenId: 'screen_2',
      elementId: 't1_1_z0__btn_p1_stop',
      tagId: 'MOTOR1_STOP',
      property: 'fill',
      interaction: 'pulse',
    },
  ];
  const tagTypeFor = (tagId) => (tagId.startsWith('MOTOR') ? 'BOOL' : '');

  it('isBoolCommandBinding accepts pulse MOTOR start/stop tags', () => {
    assert.equal(isBoolCommandBinding(bindings[0], 'BOOL'), true);
    assert.equal(isBoolCommandBinding(bindings[1], 'BOOL'), true);
  });

  it('resolves click on START rect', () => {
    const { grid, rect } = makeGridWithStartButton();
    const hit = resolveBoolCommandFromEvent({ target: rect }, grid, bindings, tagTypeFor);
    assert.equal(hit?.tagId, 'MOTOR1_START');
    assert.equal(hit?.el, rect);
  });

  it('resolves click on PUMP 1 START text label via sibling rect', () => {
    const { grid, rect, label } = makeGridWithStartButton();
    const hit = resolveBoolCommandFromEvent({ target: label }, grid, bindings, tagTypeFor);
    assert.equal(hit?.tagId, 'MOTOR1_START');
    assert.equal(hit?.el, rect);
  });
});

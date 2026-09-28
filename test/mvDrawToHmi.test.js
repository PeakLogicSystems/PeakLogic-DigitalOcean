'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  compileMvDrawToHmi,
  mergeCompiledHmiIntoSettings,
  motorPrefixFromNode,
} = require('../mv-draw/src/mvDrawToHmi');

const PUBLIC_ROOT = path.join(__dirname, '..', 'public');

describe('mvDrawToHmi', () => {
  it('derives motor prefix from alarm tag or meta', () => {
    assert.equal(motorPrefixFromNode({ alarmTag: 'MOTOR2_FAULT' }, 0, 'MOTOR1'), 'MOTOR2');
    assert.equal(motorPrefixFromNode({ alarmTag: 'MOTOR2_FAULT' }, 1, 'MOTOR1'), 'MOTOR3');
    assert.equal(motorPrefixFromNode({ tagPrefix: 'PMP_A' }, 0, 'MOTOR1'), 'PMP_A');
    assert.equal(motorPrefixFromNode({ deviceId: 'lift-1' }, 0, 'MOTOR1'), 'LIFT_1');
    assert.equal(motorPrefixFromNode({ deviceId: 'lift-1' }, 1, 'MOTOR1'), 'LIFT_1_2');
  });

  it('compiles lift_duplex into alternator + motor_hoa tiles and bindings', () => {
    const doc = {
      format: 'peaklogic-mvdraw',
      nodes: [{
        id: 'duplex-1',
        type: 'lift_duplex',
        x: 10,
        y: 10,
        label: 'Lift station',
        meta: {
          alarmTag: 'MOTOR1_FAULT',
          levelTag: 'TANK_LVL',
        },
      }],
    };
    const compiled = compileMvDrawToHmi(doc, { publicRoot: PUBLIC_ROOT });
    assert.equal(compiled.stats.nodesCompiled, 1);
    assert.ok(compiled.stats.tileCount >= 3);
    assert.ok(compiled.stats.bindingCount > 20);
    assert.equal(compiled.summaries[0].recipe, 'duplex_mcc');
    assert.equal(compiled.summaries[0].motor1, 'MOTOR1');
    assert.equal(compiled.summaries[0].motor2, 'MOTOR2');

    const motorSta = compiled.bindings.filter((b) => b.tagId === 'MOTOR1_STA');
    const motor2Hoa = compiled.bindings.filter((b) => b.tagId === 'MOTOR2_HOA');
    assert.ok(motorSta.length >= 1);
    assert.ok(motor2Hoa.length >= 1);
    assert.ok(compiled.bindings.some((b) => b.format === 'state3'));
    assert.ok(compiled.screen.tiles.some((t) => t.label === 'Lift station'));
  });

  it('merges compiled screen into settings and area popup list', () => {
    const doc = {
      format: 'peaklogic-mvdraw',
      nodes: [{
        id: 'p1',
        type: 'lift_simplex',
        x: 0,
        y: 0,
        meta: { tagPrefix: 'MOTOR1' },
      }],
    };
    const compiled = compileMvDrawToHmi(doc, { publicRoot: PUBLIC_ROOT, screenId: 'test_mcc' });
    const merged = mergeCompiledHmiIntoSettings({ hmi: { screens: [], bindings: [] } }, compiled, PUBLIC_ROOT);
    const screenId = merged.hmi.screens[0]?.id;
    assert.ok(screenId);
    assert.ok(merged.hmi.bindings.some((b) => b.screenId === screenId && b.tagId === 'MOTOR1_HOA'));
    assert.ok(merged.hmi.layout.areaPopupScreens.includes(screenId));
  });
});

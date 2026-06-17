'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildOptaProgramBody } = require('../src/fleet/mqttOptaProgram');

describe('buildOptaProgramBody', () => {
  it('parses minimal ST program', () => {
    const tagStore = {
      list: () => [
        { id: 'I1', type: 'BOOL', role: 'input', driverId: 'opta_mqtt_st' },
        { id: 'R1', type: 'BOOL', role: 'output', driverId: 'opta_mqtt_st' },
      ],
    };
    const src = 'IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;';
    const r = buildOptaProgramBody(src, tagStore, 'opta_mqtt_st');
    assert.equal(r.ok, true);
    assert.ok(r.body.ast);
    assert.ok(r.body.tagIds.includes('I1'));
  });

  it('includes program memory tags with inferred types', () => {
    const tagStore = {
      list: () => [
        { id: 'I1', type: 'BOOL', role: 'input', driverId: 'opta_mqtt_st' },
        { id: 'I1_RAW', type: 'INT', role: 'input', driverId: 'opta_mqtt_st' },
        { id: 'R1', type: 'BOOL', role: 'output', driverId: 'opta_mqtt_st' },
        { id: 'R2', type: 'BOOL', role: 'output', driverId: 'opta_mqtt_st' },
        { id: 'H1', type: 'INT', role: 'memory', value: 512, driverId: 'opta_mqtt_st' },
        { id: 'PID1', type: 'PID', role: 'memory', preset: 512, mode: 'PI', driverId: 'opta_mqtt_st' },
        { id: 'AVG1', type: 'AVG', role: 'memory', preset: 8, mode: 'MOV', driverId: 'opta_mqtt_st' },
      ],
    };
    const src = [
      'PidPv(PID1, I1_RAW);',
      'PidSp(PID1, H1);',
      'PidAuto(PID1);',
      'PidOut(PID1, H2);',
      'AvgIn(AVG1, I1_RAW);',
      'AvgOut(AVG1, H3);',
      'IF AvgReady(AVG1) THEN TurnON(R2); ELSE TurnOFF(R2); END_IF;',
    ].join('\n');
    const r = buildOptaProgramBody(src, tagStore, 'opta_mqtt_st');
    assert.equal(r.ok, true);
    assert.ok(r.body.tagIds.includes('H2'));
    assert.ok(r.body.tagIds.includes('H3'));
    const h2 = r.body.tags.find((t) => t.id === 'H2');
    assert.equal(h2.type, 'INT');
    assert.equal(h2.role, 'memory');
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildOptaProgramBody, slimPutProgramBodyForMqtt } = require('../src/parc/mqttOptaProgram');

describe('buildOptaProgramBody', () => {
  it('parses minimal ST program', () => {
    const tagStore = {
      list: () => [
        { id: 'I1', type: 'BOOL', role: 'input', driverId: 'opta_mqtt_st' },
        { id: 'R1', type: 'BOOL', role: 'output', driverId: 'opta_mqtt_st' },
        { id: 'I2', type: 'BOOL', role: 'input', driverId: 'opta_mqtt_st' },
      ],
    };
    const src = 'IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;';
    const r = buildOptaProgramBody(src, tagStore, 'opta_mqtt_st');
    assert.equal(r.ok, true);
    assert.ok(r.body.bc);
    assert.deepEqual(r.tagIds, ['I1', 'R1']);
    assert.ok(!r.tagIds.includes('I2'));
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
    assert.ok(r.tagIds.includes('H2'));
    assert.ok(r.tagIds.includes('H3'));
    const h2 = r.tags.find((t) => t.id === 'H2');
    assert.equal(h2.type, 'INT');
    assert.equal(h2.role, undefined);
  });

  it('slim deploy omits unrelated PC memory tags', () => {
    const extras = Array.from({ length: 20 }, (_, i) => ({
      id: `VPB${i + 1}`,
      type: 'BOOL',
      role: 'memory',
      value: false,
      driverId: 'opta_eth',
    }));
    const tagStore = {
      list: () => [
        { id: 'I1', type: 'BOOL', role: 'input', driverId: 'opta_eth' },
        { id: 'R1', type: 'BOOL', role: 'output', driverId: 'opta_eth' },
        ...extras,
      ],
    };
    const src = 'IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;';
    const r = buildOptaProgramBody(src, tagStore, 'opta_eth');
    assert.equal(r.ok, true);
    assert.ok(!r.tagIds.includes('VPB1'));
    assert.deepEqual(r.tagIds, ['I1', 'R1']);
  });

  it('feature suite deploy stays under Opta byte limit', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { OPTA_PROGRAM_MAX_BYTES } = require('../src/drivers/optaProtocol');
    const { estimateOptaDeploy } = require('../src/parc/mqttOptaProgram');
    const fixtureTags = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../st/fixtures/tags.all_st_features.json'),
      'utf8',
    ));
    const tagStore = { list: () => fixtureTags };
    const src = fs.readFileSync(
      path.join(__dirname, '../st/logic/21_all_st_features_memory.st'),
      'utf8',
    );
    const est = estimateOptaDeploy(src, tagStore, null);
    assert.equal(est.ok, true);
    assert.ok(est.bytes < OPTA_PROGRAM_MAX_BYTES, `deploy ${est.bytes} >= ${OPTA_PROGRAM_MAX_BYTES}`);
    assert.ok(est.tagCount > 0);
    assert.ok(est.bcBytes > 0);
  });

  it('slimPutProgramBodyForMqtt omits traceMap and sends tracePointCount', () => {
    const tagStore = {
      list: () => [
        { id: 'I1', type: 'BOOL', role: 'input', driverId: 'opta_mqtt_st' },
        { id: 'R1', type: 'BOOL', role: 'output', driverId: 'opta_mqtt_st' },
      ],
    };
    const src = 'IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;';
    const built = buildOptaProgramBody(src, tagStore, 'opta_mqtt_st');
    assert.equal(built.ok, true);
    assert.ok(built.body.traceMap?.length > 0);

    const full = JSON.stringify(built.body);
    const slim = slimPutProgramBodyForMqtt(built.body, built.traceMap);
    assert.equal(slim.traceMap, undefined);
    assert.equal(slim.tracePointCount, built.traceMap.length);
    assert.ok(Buffer.byteLength(JSON.stringify(slim)) < Buffer.byteLength(full));
  });
});

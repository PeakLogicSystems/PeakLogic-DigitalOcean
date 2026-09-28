'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  groupReadBlocks,
  parseModbusResponseFrames,
  decodeTagsFromModbusMap,
  modbusMapFromPreset,
} = require('../src/parc/draginoModbusMap');
const { draginoToParcReport } = require('../src/parc/draginoTelemetry');

describe('draginoModbusMap', () => {
  it('groups explicit tags into Modbus read blocks', () => {
    const tags = [
      { id: 'A', type: 'INT', role: 'input', table: 'holding', address: 0, slaveId: 1 },
      { id: 'B', type: 'INT', role: 'input', table: 'holding', address: 1, slaveId: 1 },
    ];
    const reads = groupReadBlocks(tags);
    assert.equal(reads.length, 1);
    assert.equal(reads[0].functionCode, 0x03);
    assert.equal(reads[0].startRegister, 0);
    assert.equal(reads[0].registerCount, 2);
  });

  it('decodes named tags from Modbus response hex', () => {
    const modbusMap = {
      reads: [{
        slaveId: 1,
        functionCode: 0x04,
        startRegister: 0,
        endRegister: 3,
        registerCount: 4,
        items: [{
          tag: {
            id: 'EC_US_CM',
            type: 'REAL',
            role: 'input',
            table: 'input',
            address: 0,
            slaveId: 1,
            wordWidth: 16,
            signed: false,
            scale: 0.1,
          },
          address: 0,
          regSpan: 1,
        }, {
          tag: {
            id: 'EC_TEMP_C',
            type: 'REAL',
            role: 'input',
            table: 'input',
            address: 1,
            slaveId: 1,
            wordWidth: 16,
            signed: true,
            scale: 0.1,
          },
          address: 1,
          regSpan: 1,
        }],
      }],
      tags: [],
    };
    // FC04, 4 data bytes: reg0=1000, reg1=250
    const hex = '01040403e800fa';
    const tags = decodeTagsFromModbusMap(hex, modbusMap);
    assert.equal(tags.length, 2);
    assert.equal(tags[0].id, 'EC_US_CM');
    assert.equal(tags[0].value, 100);
    assert.equal(tags[1].id, 'EC_TEMP_C');
    assert.equal(tags[1].value, 25);
  });

  it('modbusMapFromPreset loads DFRobot EC template', () => {
    const map = modbusMapFromPreset('dfrobot_sen0706_ec', { slaveId: 1 });
    assert.equal(map.presetId, 'dfrobot_sen0706_ec');
    assert.ok(map.tags.some((t) => t.id === 'EC_US_CM'));
    assert.ok(map.reads.length >= 1);
  });

  it('modbusMapFromPreset loads Opta Parc Dragino template with IO + pseudo AI', () => {
    const map = modbusMapFromPreset('opta_parc_modbus_dragino', { slaveId: 2 });
    assert.equal(map.slaveId, 2);
    assert.ok(map.tags.some((t) => t.id === 'I1' && t.table === 'discrete'));
    assert.ok(map.tags.some((t) => t.id === 'R1' && t.table === 'coil'));
    assert.ok(map.tags.some((t) => t.id === 'I1_RAW'));
    assert.ok(map.tags.some((t) => t.id === 'mA_AI3'));
    assert.ok(map.tags.some((t) => t.id === 'scaled_AI6'));
    assert.ok(map.tags.some((t) => t.id === 'MCSA_CH1_AMPS'));
    assert.ok(map.tags.some((t) => t.id === 'PDM_P2_HEALTH'));
    const fc02 = map.reads.find((r) => r.functionCode === 0x02);
    const fc01 = map.reads.find((r) => r.functionCode === 0x01);
    const fc04 = map.reads.find((r) => r.functionCode === 0x04);
    assert.ok(fc02);
    assert.equal(fc02.registerCount, 8);
    assert.ok(fc01);
    assert.equal(fc01.registerCount, 4);
    assert.ok(fc04);
    assert.equal(fc04.registerCount, 24);
  });

  it('decodes Opta Parc discrete, coil, and analog tags from concatenated Modbus hex', () => {
    const modbusMap = modbusMapFromPreset('opta_parc_modbus_dragino', { slaveId: 2 });
    // FC02: I1=1 I3=1 (0x05), FC01: R1-R4 on (0x0F), FC04: 24 regs
    const ir = Buffer.alloc(48);
    ir.writeUInt16BE(512, 0); // I1_RAW @ reg 0
    ir.writeUInt16BE(2000, 16); // mA_AI3 @ reg 8
    ir.writeUInt16BE(455, 24); // scaled_AI3 @ reg 12
    ir.writeUInt16BE(1250, 32); // MCSA_CH1_AMPS @ reg 16
    ir.writeUInt16BE(8750, 44); // PDM_P1_HEALTH @ reg 22
    const hex = `02020105${'0201010f'}020430${ir.toString('hex')}`;
    const tags = decodeTagsFromModbusMap(hex, modbusMap);
    const byId = Object.fromEntries(tags.map((t) => [t.id, t]));
    assert.equal(byId.I1.value, true);
    assert.equal(byId.I3.value, true);
    assert.equal(byId.I2.value, false);
    assert.equal(byId.R1.value, true);
    assert.equal(byId.I1_RAW.value, 512);
    assert.equal(byId.mA_AI3.value, 20);
    assert.equal(byId.scaled_AI3.value, 45.5);
    assert.equal(byId.MCSA_CH1_AMPS.value, 12.5);
    assert.equal(byId.PDM_P1_HEALTH.value, 87.5);
  });

  it('draginoToParcReport uses bound modbus map when provided', () => {
    const modbusMap = modbusMapFromPreset('dfrobot_sen0706_ec');
    const report = draginoToParcReport({
      Model: 'RS485-NB',
      Payload: '01040803e800fa006400c8',
      battery: 3.6,
      signal: 20,
    }, 'dragino_ec_01', { modbusMap });

    assert.ok(report.tags.some((t) => t.id === 'EC_US_CM'));
    assert.equal(report.modbusPreset, 'dfrobot_sen0706_ec');
  });

  it('modbusMapFromPreset loads JXCT 7-in-1 Dragino template as one FC03 block', () => {
    const map = modbusMapFromPreset('jxct_npk_jxbs3001_dragino', { slaveId: 1 });
    assert.equal(map.presetId, 'jxct_npk_jxbs3001_dragino');
    assert.equal(map.baud, 9600);
    assert.equal(map.tags.length, 7);
    assert.equal(map.reads.length, 1);
    assert.equal(map.reads[0].functionCode, 0x03);
    assert.equal(map.reads[0].startRegister, 6);
    assert.equal(map.reads[0].registerCount, 27);
  });

  it('decodes JXCT 7-in-1 soil tags from Dragino Modbus payload hex', () => {
    const modbusMap = modbusMapFromPreset('jxct_npk_jxbs3001_dragino');
    const data = Buffer.alloc(54);
    data.writeUInt16BE(682, 0);
    data.writeUInt16BE(455, 12 * 2);
    data.writeUInt16BE(223, 13 * 2);
    data.writeUInt16BE(850, 15 * 2);
    data.writeUInt16BE(120, 24 * 2);
    data.writeUInt16BE(45, 25 * 2);
    data.writeUInt16BE(180, 26 * 2);
    const hex = `010336${data.toString('hex')}`;
    const tags = decodeTagsFromModbusMap(hex, modbusMap);
    const byId = Object.fromEntries(tags.map((t) => [t.id, t]));
    assert.equal(byId.SOIL_PH.value, 6.82);
    assert.equal(byId.SOIL_MOIST_PCT.value, 45.5);
    assert.equal(byId.SOIL_TEMP_C.value, 22.3);
    assert.equal(byId.SOIL_EC_US_CM.value, 850);
    assert.equal(byId.N_MG_KG.value, 120);
    assert.equal(byId.P_MG_KG.value, 45);
    assert.equal(byId.K_MG_KG.value, 180);
  });

  it('draginoToParcReport maps JXCT 7-in-1 named tags', () => {
    const modbusMap = modbusMapFromPreset('jxct_npk_jxbs3001_dragino');
    const data = Buffer.alloc(54);
    data.writeUInt16BE(682, 0);
    data.writeUInt16BE(455, 12 * 2);
    data.writeUInt16BE(223, 13 * 2);
    data.writeUInt16BE(850, 15 * 2);
    data.writeUInt16BE(120, 24 * 2);
    data.writeUInt16BE(45, 25 * 2);
    data.writeUInt16BE(180, 26 * 2);
    const report = draginoToParcReport({
      Model: 'RS485-NB',
      Payload: `010336${data.toString('hex')}`,
      battery: 3.62,
      signal: 22,
    }, 'dragino_jxct_01', { modbusMap });

    assert.equal(report.modbusPreset, 'jxct_npk_jxbs3001_dragino');
    assert.ok(report.tags.some((t) => t.id === 'SOIL_PH' && t.value === 6.82));
    assert.ok(report.tags.some((t) => t.id === 'K_MG_KG' && t.value === 180));
  });

  it('modbusMapFromPreset loads JXCT ×4 Dragino template as four FC03 blocks', () => {
    const map = modbusMapFromPreset('jxct_npk_jxbs3001_dragino_x4');
    assert.equal(map.tags.length, 28);
    assert.equal(map.reads.length, 4);
    assert.deepEqual(map.reads.map((r) => r.slaveId), [1, 2, 3, 4]);
    assert.ok(map.reads.every((r) => r.functionCode === 0x03 && r.startRegister === 6 && r.registerCount === 27));
  });

  it('decodes JXCT ×4 soil tags from concatenated Dragino Modbus hex', () => {
    const modbusMap = modbusMapFromPreset('jxct_npk_jxbs3001_dragino_x4');
    function frame(slaveId, phRaw, moistRaw) {
      const data = Buffer.alloc(54);
      data.writeUInt16BE(phRaw, 0);
      data.writeUInt16BE(moistRaw, 12 * 2);
      const head = Buffer.from([slaveId, 0x03, 0x36]);
      return Buffer.concat([head, data]).toString('hex');
    }
    const hex = [frame(1, 650, 400), frame(2, 700, 410), frame(3, 720, 420), frame(4, 680, 430)].join('');
    const tags = decodeTagsFromModbusMap(hex, modbusMap);
    const byId = Object.fromEntries(tags.map((t) => [t.id, t]));
    assert.equal(byId.S1_SOIL_PH.value, 6.5);
    assert.equal(byId.S1_SOIL_MOIST_PCT.value, 40);
    assert.equal(byId.S2_SOIL_PH.value, 7);
    assert.equal(byId.S3_SOIL_MOIST_PCT.value, 42);
    assert.equal(byId.S4_SOIL_PH.value, 6.8);
    assert.equal(byId.S4_SOIL_MOIST_PCT.value, 43);
  });

  it('modbusMapFromPreset loads DFRobot pool chemistry Dragino profile', () => {
    const map = modbusMapFromPreset('dfrobot_pool_chemistry_dragino');
    assert.equal(map.baud, 4800);
    assert.equal(map.tags.length, 4);
    assert.equal(map.reads.length, 2);
    assert.equal(map.reads[0].functionCode, 0x04);
    assert.equal(map.reads[0].slaveId, 1);
    assert.equal(map.reads[0].registerCount, 3);
    assert.equal(map.reads[1].slaveId, 2);
    assert.equal(map.reads[1].registerCount, 1);
  });

  it('decodes DFRobot pool chemistry tags from Dragino payload hex', () => {
    const modbusMap = modbusMapFromPreset('dfrobot_pool_chemistry_dragino');
    const hex = '010406000002e6011d020402007d';
    const tags = decodeTagsFromModbusMap(hex, modbusMap);
    const byId = Object.fromEntries(tags.map((t) => [t.id, t]));
    assert.equal(byId.PH_PV.value, 7.42);
    assert.equal(byId.WATER_TEMP_C.value, 28.5);
    assert.equal(byId.CL_PV.value, 1.25);
  });

  it('draginoToParcReport maps pool chemistry named tags', () => {
    const modbusMap = modbusMapFromPreset('dfrobot_pool_chemistry_dragino');
    const report = draginoToParcReport({
      Model: 'RS485-NB',
      Payload: '010406000002e6011d020402007d',
      battery: 3.58,
      signal: 24,
    }, 'dragino_pool_chem', { modbusMap });
    assert.equal(report.modbusPreset, 'dfrobot_pool_chemistry_dragino');
    assert.ok(report.tags.some((t) => t.id === 'PH_PV' && t.value === 7.42));
    assert.ok(report.tags.some((t) => t.id === 'CL_PV' && t.value === 1.25));
  });
});

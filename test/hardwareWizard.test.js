'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  filterPresetsByTransportGroup,
  transportGroupForPreset,
  connectionFieldSpec,
  buildApplyPresetRequest,
  listTransportGroups,
} = require('../src/devices/hardwareWizard');

const SAMPLE_PRESETS = [
  { id: 'datexel_dat10148', label: 'Datexel', transport: 'modbus_rtu', defaults: { serialPort: 'COM3', baud: 9600, slaveId: 1 } },
  { id: 'scan_concube_tcp', label: 'ConCube TCP', transport: 'modbus_tcp', defaults: { host: '192.168.1.10', port: 502 } },
  { id: 'arduino_opta_parc', label: 'Opta Parc', transport: 'mqtt_parc', driverId: 'opta_st_01', defaults: { deviceId: 'opta_st_01' } },
  { id: 'nextcentury_rt4510', label: 'NextCentury', transport: 'nextcentury' },
];

describe('hardwareWizard', () => {
  it('listTransportGroups returns stable ids', () => {
    const groups = listTransportGroups();
    assert.ok(groups.some((g) => g.id === 'modbus_rtu'));
    assert.ok(groups.some((g) => g.id === 'mqtt_parc'));
  });

  it('transportGroupForPreset maps vgreen_epc to modbus_rtu', () => {
    assert.equal(transportGroupForPreset({ transport: 'vgreen_epc' }), 'modbus_rtu');
    assert.equal(transportGroupForPreset({ transport: 'pentair_rs485' }), 'modbus_rtu');
    assert.equal(transportGroupForPreset({ transport: 'mqtt_parc_telemetry' }), 'mqtt_parc');
  });

  it('filterPresetsByTransportGroup filters by group', () => {
    const rtu = filterPresetsByTransportGroup('modbus_rtu', SAMPLE_PRESETS);
    assert.equal(rtu.length, 1);
    assert.equal(rtu[0].id, 'datexel_dat10148');
    const parc = filterPresetsByTransportGroup('mqtt_parc', SAMPLE_PRESETS);
    assert.equal(parc[0].id, 'arduino_opta_parc');
  });

  it('connectionFieldSpec returns modbus RTU fields', () => {
    const fields = connectionFieldSpec(SAMPLE_PRESETS[0]);
    assert.ok(fields.some((f) => f.id === 'serialPort'));
    assert.ok(fields.some((f) => f.id === 'baud'));
  });

  it('connectionFieldSpec returns deviceId for mqtt_parc', () => {
    const fields = connectionFieldSpec(SAMPLE_PRESETS[2]);
    assert.ok(fields.some((f) => f.id === 'deviceId'));
  });

  it('buildApplyPresetRequest builds modbus RTU body', () => {
    const body = buildApplyPresetRequest(SAMPLE_PRESETS[0], {
      serialPort: 'COM5',
      baud: 19200,
      slaveId: 2,
    });
    assert.equal(body.presetId, 'datexel_dat10148');
    assert.equal(body.serialPort, 'COM5');
    assert.equal(body.baud, 19200);
    assert.equal(body.slaveId, 2);
    assert.equal(body.replaceTags, false);
  });

  it('buildApplyPresetRequest builds mqtt_parc body with driverId', () => {
    const body = buildApplyPresetRequest(SAMPLE_PRESETS[2], {
      deviceId: 'opta_012355b52d66a109ee',
      driverId: 'motor_skid_main',
    });
    assert.equal(body.deviceId, 'opta_012355b52d66a109ee');
    assert.equal(body.driverId, 'motor_skid_main');
  });
});

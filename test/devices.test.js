'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { listPresets, buildFromPreset } = require('../src/devices/devicePresets');
const { TEMPLATES_DIR } = require('../src/devices/loadJsonTemplates');

describe('devicePresets', () => {
  it('lists Waveshare RTU 8CH preset', () => {
    const presets = listPresets();
    const ws = presets.find((p) => p.id === 'waveshare_rtu_io_8ch');
    assert.ok(ws);
    assert.equal(ws.diCount, 8);
    assert.equal(ws.doCount, 8);
  });

  it('builds 8 DI and 8 DO tags with modbus addresses', () => {
    const { driver, tags } = buildFromPreset('waveshare_rtu_io_8ch', { serialPort: 'COM5', slaveId: 2 });
    assert.equal(driver.type, 'modbus_rtu');
    assert.equal(driver.serialPort, 'COM5');
    assert.equal(driver.slaveId, 2);
    assert.equal(tags.length, 16);
    assert.equal(tags.find((t) => t.id === 'DI1').driverAddress.address, 0);
    assert.equal(tags.find((t) => t.id === 'DI8').driverAddress.address, 7);
    assert.equal(tags.find((t) => t.id === 'Q1').driverAddress.table, 'coil');
    assert.equal(tags.find((t) => t.id === 'Q8').driverAddress.address, 7);
  });

  it('lists JSON device templates', () => {
    const opta = listPresets().find((p) => p.id === 'opta_rtu_slave');
    assert.ok(opta);
    assert.equal(opta.diCount, 8);
    assert.equal(opta.doCount, 4);
    assert.equal(opta.aiCount, 8);
    assert.equal(opta.defaults.slaveId, 2);
    assert.equal(opta.defaults.baud, 9600);
    const mv = listPresets().find((p) => p.id === 'arduino_opta_mv');
    assert.ok(mv);
    assert.equal(mv.defaults.baud, 19200);
    assert.equal(mv.defaults.parity, 'even');
  });

  it('builds Opta slave map: discrete 0-7, coils 0-3, IR raw 0-7, HM 8-15', () => {
    const { driver, tags } = buildFromPreset('opta_rtu_slave', { serialPort: 'COM11', slaveId: 2 });
    assert.equal(driver.id, 'opta_rtu');
    assert.equal(driver.serialPort, 'COM11');
    assert.equal(tags.length, 36);
    assert.equal(tags.find((t) => t.id === 'I1').driverAddress.table, 'discrete');
    assert.equal(tags.find((t) => t.id === 'I8').driverAddress.address, 7);
    assert.equal(tags.find((t) => t.id === 'R1').driverAddress.table, 'coil');
    assert.equal(tags.find((t) => t.id === 'R4').driverAddress.address, 3);
    assert.equal(tags.find((t) => t.id === 'I1_RAW').driverAddress.address, 0);
    assert.equal(tags.find((t) => t.id === 'I8_RAW').driverAddress.address, 7);
    assert.equal(tags.find((t) => t.id === 'H1').driverAddress.table, 'holding');
    assert.equal(tags.find((t) => t.id === 'HM1').driverAddress.address, 8);
    assert.equal(tags.find((t) => t.id === 'HM8').driverAddress.address, 15);
  });

  it('builds official Opta mV map from JSON template', () => {
    const { driver, tags } = buildFromPreset('arduino_opta_mv', { slaveId: 1 });
    assert.equal(driver.id, 'opta_mv');
    assert.equal(driver.parity, 'even');
    assert.equal(tags.find((t) => t.id === 'I1_MV').driverAddress.address, 8);
    assert.equal(tags.length, 32);
  });

  it('lists S::CAN template as dedicated driver (not shared bus)', () => {
    const scan = listPresets().find((p) => p.id === 'scan_spectrolyser');
    assert.ok(scan);
    assert.equal(scan.driverId, 'scan_spec');
    assert.equal(scan.sharedBus, false);
  });

  it('lists S::CAN con::cube templates', () => {
    const tcp = listPresets().find((p) => p.id === 'scan_concube_tcp');
    assert.ok(tcp);
    assert.equal(tcp.transport, 'modbus_tcp');
    assert.equal(tcp.sharedBus, false);
    const rtu = listPresets().find((p) => p.id === 'scan_concube_rtu');
    assert.ok(rtu);
    assert.equal(rtu.transport, 'modbus_rtu');
  });

  it('lists Datexel DAT10148 template', () => {
    const dx = listPresets().find((p) => p.id === 'datexel_dat10148');
    assert.ok(dx);
    assert.equal(dx.diCount, 16);
    assert.equal(dx.doCount, 0);
    assert.equal(dx.defaults.baud, 9600);
    assert.equal(dx.defaults.slaveId, 1);
  });

  it('reloads JSON templates when template files change', () => {
    const tmpPath = path.join(TEMPLATES_DIR, 'hot_reload_probe.json');
    const spec = {
      id: 'hot_reload_probe',
      label: 'Hot reload test',
      transport: 'modbus_rtu',
      driverId: 'hot_reload_test',
      tags: { discrete: [{ prefix: 'DI', count: 1, start: 0 }] },
    };
    try {
      assert.equal(listPresets().find((p) => p.id === 'hot_reload_probe'), undefined);
      fs.writeFileSync(tmpPath, `${JSON.stringify(spec)}\n`, 'utf8');
      const listed = listPresets().find((p) => p.id === 'hot_reload_probe');
      assert.ok(listed);
      assert.equal(listed.label, 'Hot reload test');
      const { tags } = buildFromPreset('hot_reload_probe');
      assert.equal(tags.length, 1);
      assert.equal(tags[0].id, 'DI1');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      assert.equal(listPresets().find((p) => p.id === 'hot_reload_probe'), undefined);
    }
  });

  it('builds Datexel DAT10148 map: discrete 0-15 (D0-D15)', () => {
    const { driver, tags } = buildFromPreset('datexel_dat10148', { serialPort: 'COM9', slaveId: 3 });
    assert.equal(driver.id, 'dat10148');
    assert.equal(driver.type, 'modbus_rtu');
    assert.equal(driver.serialPort, 'COM9');
    assert.equal(driver.slaveId, 3);
    assert.equal(tags.length, 16);
    assert.equal(tags.find((t) => t.id === 'DI1').driverAddress.table, 'discrete');
    assert.equal(tags.find((t) => t.id === 'DI1').driverAddress.address, 0);
    assert.equal(tags.find((t) => t.id === 'DI16').driverAddress.address, 15);
  });

  it('builds Opta MQTT Parc template with tagsFromDevice (driver only)', () => {
    const listed = listPresets().find((p) => p.id === 'arduino_opta_parc');
    assert.ok(listed, 'arduino_opta_parc template');
    assert.equal(listed.tagsFromDevice, true);
    const { driver, tags } = buildFromPreset('arduino_opta_parc', { driverId: 'opta_st_01' });
    assert.equal(driver.type, 'mqtt_parc');
    assert.equal(tags.length, 0);
  });

  it('lists EdgePoint Industrial MQTT template', () => {
    const listed = listPresets().find((p) => p.id === 'edgepoint_industrial');
    assert.ok(listed);
    assert.equal(listed.transport, 'mqtt');
    assert.equal(listed.sharedBus, false);
  });

  it('builds NextCentury template as API driver (not modbus_rtu)', () => {
    const { driver, tags } = buildFromPreset('nextcentury_rt4510', { driverId: 'nextcentury1' });
    assert.equal(driver.type, 'nextcentury');
    assert.equal(driver.serialPort, undefined);
    assert.equal(driver.reportId, 'rt_4510');
    assert.equal(driver.pollIntervalMs, 900000);
    assert.ok(tags.some((t) => t.id === 'NC_STATUS_DEVICES'));
    assert.equal(tags.find((t) => t.id === 'NC_STATUS_DEVICES').driverAddress.field, '_deviceCount');
  });

  it('builds EZ Meter DDS-RGB 2.025 holding register map', () => {
    const listed = listPresets().find((p) => p.id === 'ezmeter_dds_rgb_2025');
    assert.ok(listed);
    assert.equal(listed.sharedBus, false);
    const { driver, tags } = buildFromPreset('ezmeter_dds_rgb_2025', { serialPort: 'COM8', slaveId: 3 });
    assert.equal(driver.id, 'dds_rgb');
    assert.equal(driver.type, 'modbus_rtu');
    assert.equal(driver.serialPort, 'COM8');
    assert.equal(driver.slaveId, 1);
    assert.equal(tags.find((t) => t.id === 'DDS_V_A').driverAddress.address, 24);
    assert.equal(tags.find((t) => t.id === 'DDS_V_A').scale, 0.1);
    assert.equal(tags.find((t) => t.id === 'DDS_W_A').wordWidth, 32);
    assert.equal(tags.find((t) => t.id === 'DDS_W_A').signed, true);
    assert.equal(tags.find((t) => t.id === 'DDS_WH_SUM_IMP').driverAddress.address, 16);
    assert.equal(tags.length, 28);
  });

  it('builds Icon ProCon IS-750 ion sensor holding register map', () => {
    const listed = listPresets().find((p) => p.id === 'icon_is750_ion');
    assert.ok(listed);
    assert.equal(listed.sharedBus, false);
    const { driver, tags } = buildFromPreset('icon_is750_ion', { serialPort: 'COM8', slaveId: 3 });
    assert.equal(driver.id, 'is750_ion');
    assert.equal(driver.type, 'modbus_rtu');
    assert.equal(driver.serialPort, 'COM8');
    assert.equal(driver.slaveId, 1);
    assert.equal(driver.baud, 9600);
    assert.equal(driver.parity, 'none');
    assert.equal(tags.find((t) => t.id === 'IS750_MV').driverAddress.address, 0);
    assert.equal(tags.find((t) => t.id === 'IS750_MV').signed, true);
    assert.equal(tags.find((t) => t.id === 'IS750_MV').scale, 0.1);
    assert.equal(tags.find((t) => t.id === 'IS750_ION').driverAddress.address, 1);
    assert.equal(tags.find((t) => t.id === 'IS750_ION_DECIMAL').driverAddress.address, 2);
    assert.equal(tags.find((t) => t.id === 'IS750_TEMP_C').driverAddress.address, 3);
    assert.equal(tags.find((t) => t.id === 'IS750_TEMP_C').scale, 0.1);
    assert.equal(tags.length, 4);
  });

  it('builds Icon ProCon R7C ORP/pH transmitter holding register map', () => {
    const listed = listPresets().find((p) => p.id === 'icon_r7c_orp');
    assert.ok(listed);
    assert.equal(listed.sharedBus, false);
    const { driver, tags } = buildFromPreset('icon_r7c_orp', { serialPort: 'COM8', slaveId: 3 });
    assert.equal(driver.id, 'r7c');
    assert.equal(driver.type, 'modbus_rtu');
    assert.equal(driver.serialPort, 'COM8');
    assert.equal(driver.slaveId, 1);
    assert.equal(driver.baud, 9600);
    assert.equal(driver.parity, 'none');
    assert.equal(tags.find((t) => t.id === 'R7C_ORP_MV').driverAddress.address, 0);
    assert.equal(tags.find((t) => t.id === 'R7C_ORP_MV').signed, true);
    assert.equal(tags.find((t) => t.id === 'R7C_ORP_MV').scale, 0.1);
    assert.equal(tags.find((t) => t.id === 'R7C_PH').driverAddress.address, 1);
    assert.equal(tags.find((t) => t.id === 'R7C_PH').scale, 0.01);
    assert.equal(tags.find((t) => t.id === 'R7C_TEMP_C').driverAddress.address, 2);
    assert.equal(tags.find((t) => t.id === 'R7C_TEMP_C').scale, 0.1);
    assert.equal(tags.find((t) => t.id === 'R7C_CURRENT').driverAddress.address, 3);
    assert.equal(tags.length, 4);
  });

  it('builds Icon ProCon DO3500 input register map', () => {
    const listed = listPresets().find((p) => p.id === 'icon_do3500');
    assert.ok(listed);
    assert.equal(listed.sharedBus, false);
    const { driver, tags } = buildFromPreset('icon_do3500', { serialPort: 'COM8', slaveId: 3 });
    assert.equal(driver.id, 'do3500');
    assert.equal(driver.type, 'modbus_rtu');
    assert.equal(driver.serialPort, 'COM8');
    assert.equal(driver.slaveId, 1);
    assert.equal(driver.baud, 9600);
    assert.equal(driver.parity, 'none');
    assert.equal(tags.find((t) => t.id === 'DO3500_DO').driverAddress.table, 'input');
    assert.equal(tags.find((t) => t.id === 'DO3500_DO').driverAddress.address, 0);
    assert.equal(tags.find((t) => t.id === 'DO3500_DO').scale, 0.01);
    assert.equal(tags.find((t) => t.id === 'DO3500_TEMP_C').driverAddress.address, 1);
    assert.equal(tags.find((t) => t.id === 'DO3500_TEMP_C').scale, 0.1);
    assert.equal(tags.find((t) => t.id === 'DO3500_SAT_PCT').driverAddress.address, 2);
    assert.equal(tags.find((t) => t.id === 'DO3500_CAL_STATUS').driverAddress.address, 13);
    assert.equal(tags.length, 8);
  });
});

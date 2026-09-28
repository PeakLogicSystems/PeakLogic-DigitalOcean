'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  IOT_LINK_DEFAULT_PORTS,
  loadIotLinkPoolDrivers,
  loadIotLinkPoolTags,
  loadIotLinkPoolSettings,
  seedIotLinkPoolConfig,
  ACTIVE_PROGRAM,
} = require('../src/appliance/iotLinkPoolSeed');
const { loadFixtureBundle } = require('../src/programs/programFixtures');
const { parseProgram, validateProgram } = require('../src/engine/parser');
const { ST_DIR } = require('../src/config');

describe('iotLinkPool fixtures', () => {
  it('drivers.iot_link_pool.json exists with Linux serial ports', () => {
    const fp = path.join(ST_DIR, 'fixtures', 'drivers.iot_link_pool.json');
    assert.ok(fs.existsSync(fp));
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const badu = raw.find((d) => d.id === 'badu_pump');
    const pentairHp = raw.find((d) => d.id === 'pentair_hp');
    const pentairBus = raw.find((d) => d.id === 'pentair_bus');
    assert.equal(badu.serialPort, IOT_LINK_DEFAULT_PORTS.portA);
    assert.equal(pentairHp.serialPort, IOT_LINK_DEFAULT_PORTS.portB);
    assert.equal(pentairBus.serialPort, IOT_LINK_DEFAULT_PORTS.portB);
    assert.equal(badu.baud, 19200);
    assert.equal(pentairHp.baud, 9600);
    assert.equal(pentairHp.deviceAddr, 112);
    assert.equal(pentairBus.busGapMs, 120);
  });

  it('loadIotLinkPoolDrivers honors env port overrides', () => {
    const drivers = loadIotLinkPoolDrivers({
      env: {
        PEAKLOGIC_RS485_PORT_A: '/dev/ttyLP6',
        PEAKLOGIC_RS485_PORT_B: '/dev/ttyCUSTOM',
        PEAKLOGIC_POOL_PENTAIR: 'true',
        PEAKLOGIC_POOL_OPTA_IO: 'true',
      },
    });
    const badu = drivers.find((d) => d.id === 'badu_pump');
    const pentair = drivers.find((d) => d.id === 'pentair_hp');
    const opta = drivers.find((d) => d.id === 'opta_mqtt_st');
    assert.equal(badu.serialPort, '/dev/ttyLP6');
    assert.equal(pentair.serialPort, '/dev/ttyCUSTOM');
    assert.equal(pentair.enabled, true);
    assert.equal(opta.enabled, true);
  });

  it('loadIotLinkPoolDrivers swaps PORT B to modbus when PEAKLOGIC_POOL_MODBUS_CHEM=true', () => {
    const drivers = loadIotLinkPoolDrivers({
      env: {
        PEAKLOGIC_POOL_MODBUS_CHEM: 'true',
        PEAKLOGIC_POOL_PENTAIR: 'true',
      },
    });
    const pentair = drivers.find((d) => d.id === 'pentair_hp');
    const chem = drivers.find((d) => d.id === 'pool_chem_rtu');
    assert.equal(pentair.enabled, false);
    assert.ok(chem);
    assert.equal(chem.type, 'modbus_rtu');
    assert.equal(chem.serialPort, IOT_LINK_DEFAULT_PORTS.portB);
  });

  it('loadIotLinkPoolDrivers enables pentair_bus when PEAKLOGIC_POOL_PENTAIR_BUS=true', () => {
    const drivers = loadIotLinkPoolDrivers({
      env: {
        PEAKLOGIC_POOL_PENTAIR_BUS: 'true',
        PEAKLOGIC_POOL_INTELLIFLO: 'true',
        PEAKLOGIC_POOL_PENTAIR: 'true',
      },
    });
    const bus = drivers.find((d) => d.id === 'pentair_bus');
    const hp = drivers.find((d) => d.id === 'pentair_hp');
    const badu = drivers.find((d) => d.id === 'badu_pump');
    assert.equal(bus?.enabled, true);
    assert.equal(bus?.serialPort, IOT_LINK_DEFAULT_PORTS.portB);
    assert.equal(hp?.enabled, false);
    assert.equal(badu?.enabled, false);
  });

  it('loadIotLinkPoolTags merges Pentair bus equipment tags', () => {
    const tags = loadIotLinkPoolTags({
      env: { PEAKLOGIC_POOL_PENTAIR_BUS: 'true', PEAKLOGIC_POOL_INTELLIFLO: 'true' },
    });
    const ids = tags.map((t) => t.id);
    assert.ok(ids.includes('IFLO_RPM'));
    assert.ok(ids.includes('IC_SALT_PPM'));
    assert.ok(ids.includes('HP_MODE'));
    assert.ok(ids.includes('VLV1_POS'));
    const pumpRpm = tags.find((t) => t.id === 'PUMP_RPM');
    assert.equal(pumpRpm?.driverId, 'pentair_bus');
    assert.equal(pumpRpm?.driverAddress?.pentair, 'rpm');
    assert.equal(pumpRpm?.driverAddress?.deviceClass, 'intelliflo');
    const bwCmd = tags.find((t) => t.id === 'BW_VLV1_CMD');
    assert.equal(bwCmd?.driverId, 'pentair_bus');
    assert.equal(bwCmd?.driverAddress?.deviceClass, 'intellivalve');
    assert.equal(bwCmd?.driverAddress?.pentair, 'pos_cmd');
    const pentairVlv = tags.find((t) => t.id === 'POOL_CFG_PENTAIR_VLV');
    assert.equal(pentairVlv?.value, true);
  });

  it('loadIotLinkPoolDrivers enables jandy_bus when PEAKLOGIC_POOL_JANDY_BUS=true', () => {
    const drivers = loadIotLinkPoolDrivers({
      env: {
        PEAKLOGIC_POOL_JANDY_BUS: 'true',
        PEAKLOGIC_POOL_JANDY_EPUMP: 'true',
        PEAKLOGIC_POOL_PENTAIR_BUS: 'false',
      },
    });
    const bus = drivers.find((d) => d.id === 'jandy_bus');
    const pentair = drivers.find((d) => d.id === 'pentair_bus');
    const badu = drivers.find((d) => d.id === 'badu_pump');
    assert.equal(bus?.enabled, true);
    assert.equal(pentair?.enabled, false);
    assert.equal(badu?.enabled, false);
  });

  it('loadIotLinkPoolTags merges Jandy bus equipment tags', () => {
    const tags = loadIotLinkPoolTags({
      env: { PEAKLOGIC_POOL_JANDY_BUS: 'true', PEAKLOGIC_POOL_JANDY_EPUMP: 'true' },
    });
    const ids = tags.map((t) => t.id);
    assert.ok(ids.includes('JEP_RPM'));
    assert.ok(ids.includes('JAP_SALT_PPM'));
    assert.ok(ids.includes('JXI_RUNNING'));
    const pumpRpm = tags.find((t) => t.id === 'PUMP_RPM');
    assert.equal(pumpRpm?.driverId, 'jandy_bus');
    assert.equal(pumpRpm?.driverAddress?.jandy, 'rpm');
  });

  it('loadIotLinkPoolDrivers enables hayward_bus when PEAKLOGIC_POOL_HAYWARD_BUS=true', () => {
    const drivers = loadIotLinkPoolDrivers({
      env: {
        PEAKLOGIC_POOL_HAYWARD_BUS: 'true',
        PEAKLOGIC_POOL_HAYWARD_PUMP: 'true',
      },
    });
    const bus = drivers.find((d) => d.id === 'hayward_bus');
    assert.equal(bus?.enabled, true);
    assert.equal(bus?.baud, 19200);
    assert.equal(bus?.stopBits, 2);
  });

  it('loadIotLinkPoolTags merges Hayward VS pump tags', () => {
    const tags = loadIotLinkPoolTags({
      env: { PEAKLOGIC_POOL_HAYWARD_BUS: 'true', PEAKLOGIC_POOL_HAYWARD_PUMP: 'true' },
    });
    assert.ok(tags.some((t) => t.id === 'HVS_RPM'));
    const pumpRpm = tags.find((t) => t.id === 'PUMP_RPM');
    assert.equal(pumpRpm?.driverId, 'hayward_bus');
    assert.equal(pumpRpm?.driverAddress?.hayward, 'rpm');
  });

  it('loadIotLinkPoolTags merges Pentair heat pump only (legacy)', () => {
    const tags = loadIotLinkPoolTags();
    const ids = tags.map((t) => t.id);
    assert.ok(ids.includes('PUMP_RUN_CMD'));
    assert.ok(ids.includes('HP_MODE'));
    assert.ok(ids.includes('DOSE_CL'));
  });

  it('settings.iot_link_pool.json sets activeProgram and pool HMI', () => {
    const settings = loadIotLinkPoolSettings();
    assert.equal(settings.activeProgram, ACTIVE_PROGRAM);
    assert.equal(settings.hmi.activeScreen, 'screen_1');
    assert.ok(settings.hmi.screens.some((s) => s.tiles?.[0]?.compositeId === 'pool_overview'));
    assert.equal(settings.features.poolController, true);
  });

  it('pool controller ST validates against merged tags', () => {
    const tags = loadIotLinkPoolTags();
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '30_pool_controller.st'), 'utf8');
    const { ast } = parseProgram(src);
    const errors = validateProgram(ast, tags.map((t) => t.id));
    assert.equal(errors.length, 0, errors.join('; '));
  });

  it('loadFixtureBundle still works for pool program with default drivers file', () => {
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', loadIotLinkPoolDrivers());
    assert.ok(bundle);
    assert.equal(bundle.driversFile, 'drivers.pool_controller.json');
    assert.ok(bundle.tags.some((t) => t.id === 'POOL_BW_STA'));
  });

  it('seedIotLinkPoolConfig writes persistence files', async () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mv-iot-link-'));
    const written = new Map();
    const persistence = {
      readJson(name, fallback) {
        if (name === 'settings.json' && written.has(name)) return written.get(name);
        return fallback;
      },
      writeJson(name, data) {
        written.set(name, data);
        fs.writeFileSync(path.join(tmp, name), JSON.stringify(data, null, 2));
      },
      flushConfig: async () => {},
    };

    const result = await seedIotLinkPoolConfig(persistence, { force: true });
    assert.equal(result.seeded, true);
    assert.equal(result.activeProgram, ACTIVE_PROGRAM);
    assert.ok(written.has('tags.json'));
    assert.ok(written.has('drivers.json'));
    assert.ok(written.has('workspace.est.json'));
    const drivers = written.get('drivers.json');
    assert.ok(drivers.some((d) => d.id === 'badu_pump' && d.serialPort === IOT_LINK_DEFAULT_PORTS.portA));

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

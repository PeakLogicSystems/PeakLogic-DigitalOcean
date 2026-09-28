'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  PROJECT_ID,
  IOT_LINK_DEFAULT_PORTS,
  loadIotLinkGenericDrivers,
  loadIotLinkGenericTags,
  loadIotLinkGenericSettings,
  seedIotLinkGenericConfig,
} = require('../src/appliance/iotLinkGenericSeed');
const { ST_DIR } = require('../src/config');

describe('iotLinkGeneric fixtures', () => {
  it('drivers.iot_link.json exists with disabled RS-485 placeholders', () => {
    const fp = path.join(ST_DIR, 'fixtures', 'drivers.iot_link.json');
    assert.ok(fs.existsSync(fp));
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const portA = raw.find((d) => d.id === 'rs485_a');
    const portB = raw.find((d) => d.id === 'rs485_b');
    assert.equal(portA.serialPort, IOT_LINK_DEFAULT_PORTS.portA);
    assert.equal(portB.serialPort, IOT_LINK_DEFAULT_PORTS.portB);
    assert.equal(portA.enabled, false);
    assert.equal(portB.enabled, false);
    assert.equal(portA.type, 'modbus_rtu');
    assert.equal(portB.type, 'modbus_rtu');
    assert.ok(!raw.some((d) => d.id === 'badu_pump'));
    assert.ok(!raw.some((d) => d.id === 'pentair_hp'));
  });

  it('loadIotLinkGenericDrivers honors env port overrides', () => {
    const drivers = loadIotLinkGenericDrivers({
      env: {
        PEAKLOGIC_RS485_PORT_A: '/dev/ttyCUSTOM_A',
        PEAKLOGIC_RS485_PORT_B: '/dev/ttyCUSTOM_B',
        PEAKLOGIC_RS485_ENABLE: 'false',
      },
    });
    const portA = drivers.find((d) => d.id === 'rs485_a');
    const portB = drivers.find((d) => d.id === 'rs485_b');
    assert.equal(portA.serialPort, '/dev/ttyCUSTOM_A');
    assert.equal(portB.serialPort, '/dev/ttyCUSTOM_B');
    assert.equal(portA.enabled, false);
  });

  it('loadIotLinkGenericTags returns empty list', () => {
    const tags = loadIotLinkGenericTags();
    assert.equal(tags.length, 0);
  });

  it('settings.iot_link.json has no activeProgram and blank startup', () => {
    const settings = loadIotLinkGenericSettings();
    assert.equal(settings.activeProgram, undefined);
    assert.equal(settings.startup.mode, 'blank');
    assert.equal(settings.project.name, PROJECT_ID);
    assert.equal(settings.mqttParc.enabled, false);
    assert.equal(settings.features.poolController, false);
    assert.ok(!settings.hmi.screens?.some((s) => s.tiles?.[0]?.compositeId === 'pool_overview'));
  });

  it('loadIotLinkGenericSettings enables mqtt when PEAKLOGIC_MQTT_ENABLED=true', () => {
    const settings = loadIotLinkGenericSettings({
      env: {
        PEAKLOGIC_MQTT_ENABLED: 'true',
        PEAKLOGIC_MQTT_BROKER: 'mqtt://broker:1883',
        MOSQUITTO_USER: 'mv',
        MOSQUITTO_PASS: 'secret',
      },
    });
    assert.equal(settings.mqttParc.enabled, true);
    assert.equal(settings.mqttParc.brokerUrl, 'mqtt://broker:1883');
    assert.equal(settings.mqttParc.username, 'mv');
    assert.equal(settings.mqttParc.password, 'secret');
  });

  it('loadIotLinkGenericDrivers enables RS-485 by default on appliance', () => {
    const drivers = loadIotLinkGenericDrivers({ env: {} });
    assert.equal(drivers.find((d) => d.id === 'rs485_a').enabled, true);
    assert.equal(drivers.find((d) => d.id === 'rs485_b').enabled, true);
  });

  it('seedIotLinkGenericConfig writes persistence without pool drivers', async () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mv-iot-link-gen-'));
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

    const result = await seedIotLinkGenericConfig(persistence, { force: true });
    assert.equal(result.seeded, true);
    assert.equal(result.activeProgram, '');
    assert.equal(result.tagCount, 0);

    const drivers = written.get('drivers.json');
    assert.ok(drivers.some((d) => d.id === 'rs485_a'));
    assert.ok(!drivers.some((d) => d.id === 'badu_pump'));
    assert.ok(!drivers.some((d) => d.id === 'pentair_hp'));

    const settings = written.get('settings.json');
    assert.equal(settings.startup.mode, 'blank');
    assert.equal(settings.activeProgram, undefined);

    const ws = written.get('workspace.est.json');
    assert.equal(ws.activeProgram, '');
    assert.equal(ws.project.name, PROJECT_ID);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('seedIotLinkGenericConfig skips when already configured', async () => {
    const persistence = {
      readJson(name, fallback) {
        if (name === 'settings.json') {
          return { project: { name: 'iot-link' } };
        }
        return fallback;
      },
      writeJson() {
        assert.fail('should not write when skipping');
      },
    };
    const result = await seedIotLinkGenericConfig(persistence);
    assert.equal(result.seeded, false);
  });
});

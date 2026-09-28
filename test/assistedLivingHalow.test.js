'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  POOL_SUBSYSTEM,
  POOL_HALOW_NODES,
  BUILDING_HALOW_NODES,
  NEXCOMM_HVAC_NODES,
  manifest,
} = require('../scripts/assisted-living-halow/alf-halow-data');
const { applyPoolHalowBindings, poolHalowDrivers } = require('../scripts/assisted-living-halow/pool-halow-bindings');
const { HVAC_COND_BINDINGS } = require('../scripts/assisted-living-halow/hvac-halow-bindings');
const { buildIotLinkPoolEstDoc } = require('../src/appliance/iotLinkPoolSeed');

const ROOT = path.resolve(__dirname, '..');

describe('assisted living halow + pool subsystem', () => {
  it('manifest includes pool IOT-LINK subsystem and Nexcomm HVAC', () => {
    const m = manifest();
    assert.equal(m.poolSubsystem.product, 'iot-link-pool');
    assert.equal(m.poolSubsystem.halowMqttAnchor, true);
    assert.ok(m.buildingHalowNodes.length >= 6);
    assert.equal(m.poolHalowNodes.length, 2);
    assert.equal(m.nexcommHvacNodes.length, 3);
  });

  it('pool halow drivers replace opta', () => {
    const env = { PEAKLOGIC_POOL_OPTA_IO: 'false', PEAKLOGIC_POOL_HALOW_IO: 'true' };
    const est = buildIotLinkPoolEstDoc({ env });
    assert.equal(est.drivers.find((d) => d.id === 'opta_mqtt_st')?.enabled, false);
    const drivers = [...est.drivers.filter((d) => d.id !== 'opta_mqtt_st'), ...poolHalowDrivers()];
    const tags = applyPoolHalowBindings(est.tags, drivers);
    const ph = tags.find((t) => t.id === 'PH_AI');
    assert.equal(ph.driverId, 'pool_sensor_01');
    const flow = tags.find((t) => t.id === 'POOL_FLOW_PULSE');
    assert.equal(flow.driverId, 'thalow_pool_deck');
    assert.equal(flow.driverAddress.channel, 'FLOW');
  });

  it('generated artifacts exist when assisted-living base present', () => {
    if (!fs.existsSync(path.join(ROOT, 'data/projects/assisted-living.est.json'))) {
      return;
    }
    const files = [
      'st/fixtures/assisted_living_halow.json',
      'data/projects/assisted-living-halow.est.json',
      'data/projects/assisted-living-pool-iot-link.est.json',
      'deploy/iot-link/.env.assisted-living-pool.example',
    ];
    for (const rel of files) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    }
    const poolEst = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/assisted-living-pool-iot-link.est.json'), 'utf8'));
    const parc = poolEst.drivers.filter((d) => d.type === 'mqtt_parc');
    assert.equal(parc.length, 2);
    assert.ok(poolEst.settings.poolSubsystem.halowIo);
  });

  it('pool halow nodes include chemistry and deck', () => {
    assert.ok(POOL_HALOW_NODES.some((n) => n.deviceId === 'pool_sensor_01'));
    assert.ok(POOL_HALOW_NODES.some((n) => n.deviceId === 'thalow_pool_deck'));
    assert.ok(BUILDING_HALOW_NODES.some((n) => n.sensorTemplate === 6));
  });

  it('nexcomm HVAC MCSA binds floor condenser tags', () => {
    assert.equal(NEXCOMM_HVAC_NODES.length, 3);
    assert.ok(NEXCOMM_HVAC_NODES.every((n) => n.platform === 'mcxn947-hvac'));
    const fl1Hi = HVAC_COND_BINDINGS.find((b) => b.tagId === 'FL1_COND_HI_TEMP');
    assert.equal(fl1Hi.deviceId, 'hvac_mcsa_fl1');
    assert.equal(fl1Hi.parcTagId, 'T1_C');
    assert.equal(fl1Hi.scale, 1.8);
    const fl2Fan = HVAC_COND_BINDINGS.find((b) => b.tagId === 'FL2_COND_FAN_FLT');
    assert.equal(fl2Fan.parcTagId, 'FAN_FLT');
  });
});

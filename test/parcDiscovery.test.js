'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-disc-'));

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const persistence = require('../src/persistence');
const { DeviceRegistry } = require('../src/parc/deviceRegistry');
const {
  isEligibleOptaDiscoveryReport,
  maybeAutoDiscoverDriver,
  parcDeviceHasDriver,
} = require('../src/parc/parcDiscovery');
const { reconcileMqttParcDriversFromRegistry } = require('../src/devices/bulkAddParcOpta');
const { patchWorkspaceDrivers } = require('../src/project/estFile');
const { defaultMqttParcSettings } = require('../src/parc/mqttParcBootstrap');

const ELIGIBLE_REPORT = {
  deviceId: 'opta_012355b52d66a109ee',
  ateccSerial: '012355B52D66A109EE',
  platform: 'arduino-opta-mqtt-st',
  expansionModules: [{ slot: 0, type: 'A0602' }, { slot: 1, type: 'A0602' }],
};

function mockDriverManager(initial = []) {
  const drivers = [...initial];
  return {
    list: () => drivers.slice(),
    save: (list) => {
      drivers.length = 0;
      drivers.push(...list);
    },
    rebuild: async () => {},
    linkMqttParcDriversIfHubLive: async () => [],
    _drivers: drivers,
  };
}

describe('parcDiscovery', () => {
  it('isEligibleOptaDiscoveryReport accepts eligible ATECC report', () => {
    assert.equal(isEligibleOptaDiscoveryReport(ELIGIBLE_REPORT), true);
    assert.equal(isEligibleOptaDiscoveryReport({
      ...ELIGIBLE_REPORT,
      platform: undefined,
      meta: { platform: 'arduino-opta-mqtt-st' },
    }), true);
  });

  it('isEligibleOptaDiscoveryReport rejects noise ids', () => {
    assert.equal(isEligibleOptaDiscoveryReport({
      deviceId: 'test-01',
      ateccSerial: '012355b52d66a109ee',
      platform: 'arduino-opta-mqtt-st',
    }), false);
  });

  it('isEligibleOptaDiscoveryReport rejects opta_st_01 template id', () => {
    assert.equal(isEligibleOptaDiscoveryReport({
      deviceId: 'opta_st_01',
      ateccSerial: '012355b52d66a109ee',
      platform: 'arduino-opta-mqtt-st',
    }), false);
  });

  it('isEligibleOptaDiscoveryReport rejects wrong platform', () => {
    assert.equal(isEligibleOptaDiscoveryReport({
      ...ELIGIBLE_REPORT,
      platform: 'arduino-opta',
    }), false);
  });

  it('isEligibleOptaDiscoveryReport rejects serial/deviceId mismatch', () => {
    assert.equal(isEligibleOptaDiscoveryReport({
      deviceId: 'opta_012355b52d66a109ee',
      ateccSerial: '0123b636f1c23964ee',
      platform: 'arduino-opta-mqtt-st',
    }), false);
  });

  it('maybeAutoDiscoverDriver no-ops when autoDiscoverDrivers off', async () => {
    const dm = mockDriverManager([]);
    const registry = new DeviceRegistry();
    registry.updateSettings({ enabled: true });
    const r = await maybeAutoDiscoverDriver({
      report: ELIGIBLE_REPORT,
      registry,
      driverManager: dm,
      settings: { mqttParc: { autoDiscoverDrivers: false } },
    });
    assert.equal(r.discovered, false);
    assert.equal(r.skipped, true);
    assert.equal(r.reason, 'autoDiscoverDrivers disabled');
    assert.equal(dm.list().length, 0);
  });

  it('maybeAutoDiscoverDriver creates driver when enabled', async () => {
    const dm = mockDriverManager([]);
    const registry = new DeviceRegistry();
    registry.updateSettings({ enabled: true });
    registry.ingestReport(ELIGIBLE_REPORT);
    const r = await maybeAutoDiscoverDriver({
      report: ELIGIBLE_REPORT,
      registry,
      driverManager: dm,
      settings: { mqttParc: { autoDiscoverDrivers: true, enabled: false } },
    });
    assert.equal(r.discovered, true);
    assert.equal(r.deviceId, 'opta_012355b52d66a109ee');
    assert.equal(dm.list().length, 1);
    assert.equal(dm.list()[0].type, 'mqtt_parc');
    assert.equal(dm.list()[0].deviceId, 'opta_012355b52d66a109ee');
    assert.notEqual(dm.list()[0].id, dm.list()[0].deviceId);
    assert.equal(dm.list()[0].ateccSerial, '012355b52d66a109ee');
  });

  it('maybeAutoDiscoverDriver skips when driver already exists', async () => {
    const existing = {
      id: 'opta_012355b52d66a109ee',
      type: 'mqtt_parc',
      deviceId: 'opta_012355b52d66a109ee',
      enabled: true,
    };
    const dm = mockDriverManager([existing]);
    const registry = new DeviceRegistry();
    const r = await maybeAutoDiscoverDriver({
      report: ELIGIBLE_REPORT,
      registry,
      driverManager: dm,
      settings: { mqttParc: { autoDiscoverDrivers: true } },
    });
    assert.equal(r.discovered, false);
    assert.equal(r.reason, 'driver exists');
    assert.equal(dm.list().length, 1);
  });

  it('parcDeviceHasDriver matches id or deviceId', () => {
    const drivers = [{ id: 'x', type: 'mqtt_parc', deviceId: 'opta_0123abc' }];
    assert.equal(parcDeviceHasDriver(drivers, 'opta_0123abc'), true);
    assert.equal(parcDeviceHasDriver(drivers, 'x'), true);
    assert.equal(parcDeviceHasDriver(drivers, 'other'), false);
  });

  it('defaultMqttParcSettings keeps autoDiscoverDrivers false by default', () => {
    assert.equal(defaultMqttParcSettings({}).autoDiscoverDrivers, false);
    assert.equal(defaultMqttParcSettings({ autoDiscoverDrivers: true }).autoDiscoverDrivers, true);
  });

  it('boot reconcile patchWorkspaceDrivers updates workspace.est.json', async (t) => {
    const uri = process.env.PEAKLOGIC_CONFIG_URI || process.env.MONGODB_URI || '';
    if (!uri) {
      t.skip('MONGODB_URI not set');
      return;
    }
    process.env.PEAKLOGIC_CONFIG_URI = uri;
    process.env.PEAKLOGIC_CONFIG_DB = `mv_disc_test_${Date.now()}`;
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/configStore')];
    delete require.cache[require.resolve('../src/configStore/mongoBackend')];
    delete require.cache[require.resolve('../src/persistence')];
    const configStore = require('../src/configStore');
    await configStore.init();

    persistence.writeJson('workspace.est.json', {
      format: 'peaklogic-est',
      version: 1,
      drivers: [{ id: 'mock1', type: 'mock' }],
      tags: [],
      program: '',
      settings: {},
    });
    const registry = {
      listDevices: () => [{ deviceId: 'opta_0123b636f1c23964ee', meta: { ateccSerial: '0123b636f1c23964ee' } }],
    };
    const { drivers, changed } = reconcileMqttParcDriversFromRegistry(
      [{ id: 'mock1', type: 'mock' }],
      registry,
    );
    assert.equal(changed, true);
    assert.equal(patchWorkspaceDrivers(drivers), true);
    const ws = persistence.readJson('workspace.est.json', null);
    assert.equal(ws.drivers.length, 2);
    assert.equal(ws.drivers[1].type, 'mqtt_parc');
    assert.equal(ws.drivers[1].deviceId, 'opta_0123b636f1c23964ee');
    await configStore.shutdown();
  });
});

after(() => {
  try {
    fs.rmSync(process.env.PEAKLOGIC_DATA, { recursive: true, force: true });
  } catch { /* ignore */ }
});

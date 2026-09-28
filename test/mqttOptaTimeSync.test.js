'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSyncTimeBody } = require('../src/drivers/optaProtocol');
const { registry } = require('../src/parc/deviceRegistry');
const { syncOptaClocks, listLiveRemoteOptaConfigs } = require('../src/parc/mqttOptaTimeSync');

describe('mqttOptaTimeSync', () => {
  it('buildSyncTimeBody exports unixUtc and tzOffsetMin', () => {
    const body = buildSyncTimeBody(Date.UTC(2026, 5, 20, 12, 0, 0));
    assert.equal(body.unixUtc, Math.floor(Date.UTC(2026, 5, 20, 12, 0, 0) / 1000));
    assert.equal(typeof body.tzOffsetMin, 'number');
  });

  it('syncOptaClocks dedupes live devices', async () => {
    registry.ingestReport({
      deviceId: 'opta_live_01',
      tags: [{ id: 'I1', type: 'BOOL', value: false }],
    });
    const sent = [];
    const hub = {
      isLive: () => true,
      sendCommand: async (deviceId, op, body) => {
        sent.push({ deviceId, op, body });
      },
    };
    const origHub = require('../src/parc/mqttCentralHub').getMqttCentralHub;
    const origBootstrap = require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected;
    require('../src/parc/mqttCentralHub').getMqttCentralHub = () => hub;
    require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = async () => ({ connected: true });
    const driverManager = {
      configs: [
        { id: 'drv_a', type: 'mqtt_parc', enabled: true, deviceId: 'opta_live_01' },
        { id: 'drv_b', type: 'mqtt_parc', enabled: true, deviceId: 'opta_live_01' },
      ],
      instances: new Map([
        ['drv_a', { syncTime: async ({ deviceId }) => hub.sendCommand(deviceId, 'sync_time', buildSyncTimeBody()) }],
        ['drv_b', { syncTime: async () => { throw new Error('should not run'); } }],
      ]),
    };
    try {
      assert.equal(listLiveRemoteOptaConfigs(driverManager).length, 2);
      const r = await syncOptaClocks(driverManager);
      assert.equal(r.synced, 1);
      assert.deepEqual(r.deviceIds, ['opta_live_01']);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].op, 'sync_time');
    } finally {
      require('../src/parc/mqttCentralHub').getMqttCentralHub = origHub;
      require('../src/parc/mqttParcBootstrap').ensureMqttHubConnected = origBootstrap;
    }
  });
});

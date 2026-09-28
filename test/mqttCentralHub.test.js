'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MqttCentralHub, defaultCentralSettings } = require('../src/parc/mqttCentralHub');

function mockHubClient(hub) {
  hub.cfg = defaultCentralSettings();
  hub._subsReady = true;
  const published = [];
  hub.client = {
    connected: true,
    subscribe: (_topic, _opts, cb) => cb(null),
    publish: (_topic, payload, _opts, cb) => {
      published.push(JSON.parse(payload));
      if (cb) cb(null);
    },
  };
  return published;
}

function resolvePublished(hub, entry) {
  const pending = hub._pending.get(entry.id);
  assert.ok(pending, `pending command ${entry.id}`);
  clearTimeout(pending.timer);
  hub._pending.delete(entry.id);
  pending.resolve({});
}

describe('mqttCentralHub sendCommand', () => {
  it('serializes concurrent commands for the same deviceId', async () => {
    const hub = new MqttCentralHub({ registry: { getDevice() { return null; } } });
    const published = mockHubClient(hub);
    const deviceId = 'opta_serial_test';

    const first = hub.sendCommand(deviceId, 'runtime_status', {}, { timeoutMs: 5000 });
    const second = hub.sendCommand(deviceId, 'runtime_status', {}, { timeoutMs: 5000 });

    await new Promise((r) => setImmediate(r));
    assert.equal(published.length, 1, 'only first command should publish while first is in flight');

    resolvePublished(hub, published[0]);

    await first;
    await new Promise((r) => setImmediate(r));
    assert.equal(published.length, 2, 'second command publishes after first completes');
    resolvePublished(hub, published[1]);
    await second;
    assert.notEqual(published[0].id, published[1].id);
  });

  it('does not serialize commands for different deviceIds', async () => {
    const hub = new MqttCentralHub({ registry: { getDevice() { return null; } } });
    const published = mockHubClient(hub);

    const a = hub.sendCommand('opta_a', 'runtime_status', {}, { timeoutMs: 5000 });
    const b = hub.sendCommand('opta_b', 'runtime_status', {}, { timeoutMs: 5000 });

    await new Promise((r) => setImmediate(r));
    assert.equal(published.length, 2, 'different devices may publish in parallel');

    for (const entry of published) {
      resolvePublished(hub, entry);
    }

    await Promise.all([a, b]);
  });

  it('does not supersede an in-flight write_memory', async () => {
    const hub = new MqttCentralHub({ registry: { getDevice() { return null; } } });
    const published = mockHubClient(hub);
    const a = hub._sendCommandOnce('opta_mem', 'write_memory', {
      tags: [{ id: 'MOTOR1_START', value: true }],
    }, { timeoutMs: 5000 });
    const b = hub._sendCommandOnce('opta_mem', 'write_memory', {
      tags: [{ id: 'MOTOR1_HAND', value: true }],
    }, { timeoutMs: 5000 });
    await new Promise((r) => setImmediate(r));
    assert.equal(published.length, 2);
    assert.ok(hub._pending.get(published[0].id), 'first write_memory stays pending');
    resolvePublished(hub, published[0]);
    resolvePublished(hub, published[1]);
    await Promise.all([a, b]);
  });

  it('_onMessage resolves pending commands from cmd/response topics', async () => {
    const hub = new MqttCentralHub({ registry: { getDevice() { return null; } } });
    const published = mockHubClient(hub);
    const deviceId = 'mv_f2e689fd60d96bab';
    const cmdPromise = hub.sendCommand(deviceId, 'runtime_status', {}, { timeoutMs: 5000 });
    await new Promise((r) => setImmediate(r));
    const entry = published[0];
    assert.ok(entry?.id, 'command published');
    hub._onMessage(
      `peaklogic/v1/${deviceId}/cmd/response`,
      Buffer.from(JSON.stringify({ id: entry.id, ok: true, body: { running: false } })),
    );
    const body = await cmdPromise;
    assert.equal(body.running, false);
  });

  it('_onMessage registers device from retained online=true before telemetry', () => {
    const ingested = [];
    const deviceId = `mv_ut_online_hub_${Date.now()}`;
    const hub = new MqttCentralHub({
      registry: {
        getDevice(id) {
          return ingested.find((d) => d.deviceId === id) || null;
        },
        ingestReport(body) {
          ingested.push(body);
          return { ok: true };
        },
      },
    });
    hub.cfg = defaultCentralSettings();
    hub._onMessage(
      `peaklogic/v1/${deviceId}/online`,
      Buffer.from('{"online":true}'),
    );
    assert.equal(ingested.length, 1);
    assert.equal(ingested[0].deviceId, deviceId);
    assert.equal(ingested[0].meta.pendingTelemetry, true);
  });
});

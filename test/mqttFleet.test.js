'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { topics, deviceIdFromTopic, normalizeDeviceId } = require('../src/fleet/mqttProtocol');

describe('mqttProtocol', () => {
  it('builds topics for device', () => {
    const cfg = { topicPrefix: 'peaklogic/v1' };
    const t = topics(cfg, 'site-01');
    assert.equal(t.telemetry, 'peaklogic/v1/site-01/telemetry');
    assert.equal(t.cmd, 'peaklogic/v1/site-01/cmd');
    assert.equal(t.cmdResponse, 'peaklogic/v1/site-01/cmd/response');
  });

  it('parses deviceId from topic', () => {
    const cfg = { topicPrefix: 'peaklogic/v1' };
    assert.equal(
      deviceIdFromTopic('peaklogic/v1/rpi-02/telemetry', cfg),
      'rpi-02'
    );
    assert.equal(deviceIdFromTopic('other/rpi-02/telemetry', cfg), null);
  });

  it('rejects bad device ids', () => {
    assert.throws(() => normalizeDeviceId(''), /deviceId/);
    assert.throws(() => normalizeDeviceId('bad id'), /deviceId/);
  });
});

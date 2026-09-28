'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { topics, deviceIdFromTopic, onlineTopicInfo, telemetryTopicInfo, normalizeDeviceId } = require('../src/parc/mqttProtocol');

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
    assert.equal(
      deviceIdFromTopic('peaklogic/v1/mv_f2e689fd60d96bab/cmd/response', cfg),
      'mv_f2e689fd60d96bab',
    );
    assert.equal(
      deviceIdFromTopic('peaklogic/v1/mv_f2e689fd60d96bab/online', cfg),
      'mv_f2e689fd60d96bab',
    );
    assert.equal(deviceIdFromTopic('other/rpi-02/telemetry', cfg), null);
  });

  it('parses tenant-scoped online and telemetry topics', () => {
    const cfg = { topicPrefix: 'peaklogic/v1' };
    assert.deepEqual(
      onlineTopicInfo('peaklogic/v1/acme-corp/mv_opta01/online', cfg),
      { tenantId: 'acme-corp', deviceId: 'mv_opta01' },
    );
    assert.equal(
      deviceIdFromTopic('peaklogic/v1/acme-corp/mv_opta01/online', cfg),
      'mv_opta01',
    );
  });

  it('rejects bad device ids', () => {
    assert.throws(() => normalizeDeviceId(''), /deviceId/);
    assert.throws(() => normalizeDeviceId('bad id'), /deviceId/);
  });
});

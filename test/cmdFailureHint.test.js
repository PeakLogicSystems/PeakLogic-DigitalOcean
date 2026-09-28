'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { cmdFailureHint, brokerMismatchMessage, cmdTimeoutMessage, deviceIdMismatchHint } = require('../src/parc/cmdFailureHint');
const { registry } = require('../src/parc/deviceRegistry');

describe('cmdFailureHint', () => {
  it('detects localhost broker mismatch', () => {
    const msg = brokerMismatchMessage(
      { meta: { mqttBroker: '127.0.0.1', mqttBrokerPort: 1883 } },
      'mqtt://192.168.1.233:1883',
    );
    assert.match(msg, /127\.0\.0\.1/);
    assert.match(msg, /\/setup/);
  });

  it('detects wrong broker when hub uses 127.0.0.1 (IOT-LINK appliance)', () => {
    const msg = brokerMismatchMessage(
      { meta: { mqttBroker: '10.99.88.77', mqttBrokerPort: 1883 } },
      'mqtt://127.0.0.1:1883',
    );
    assert.match(msg, /10\.99\.88\.77/);
    assert.match(msg, /\/setup/);
  });

  it('uses firmware-aware hint when telemetry is fresh', () => {
    const msg = cmdFailureHint(
      { meta: { firmwareVersion: '2.3.44' }, stale: false, ageSec: 5 },
      { hubBrokerUrl: 'mqtt://192.168.1.233:1883' },
    );
    assert.match(msg, /2\.3\.44/);
    assert.doesNotMatch(msg, /2\.3\.28/);
  });

  it('mentions mosquitto auth when hub uses credentials but no telemetry', () => {
    const msg = cmdFailureHint(null, {
      hubBrokerUrl: 'mqtt://127.0.0.1:1883',
      mqttHubUsername: 'peaklogic',
    });
    assert.match(msg, /MOSQUITTO_ALLOW_ANONYMOUS=true/);
  });

  it('cmdTimeoutMessage includes topic and detail', () => {
    const msg = cmdTimeoutMessage({
      deviceId: 'opta_test',
      op: 'runtime_status',
      dev: { meta: { firmwareVersion: '2.3.44' }, stale: false, ageSec: 2 },
      hubBrokerUrl: 'mqtt://192.168.1.233:1883',
    });
    assert.match(msg, /peaklogic\/v1\/opta_test\/cmd/);
    assert.match(msg, /runtime_status/);
  });

  it('detects opta_ driver vs mv_ firmware telemetry', () => {
    const legacyId = 'opta_0123b636f1c23964ee';
    const mvId = 'mv_f2e689fd60d96bab';
    registry.ingestReport({
      deviceId: mvId,
      platform: 'arduino-opta-mqtt-st',
      tags: [{ id: 'I1', type: 'BOOL', value: false }],
      meta: { ateccSerial: '0123b636f1c23964ee', firmwareVersion: '2.3.48' },
    });
    const msg = cmdFailureHint(null, {
      hubBrokerUrl: 'mqtt://192.168.1.233:1883',
      deviceId: legacyId,
      registry,
    });
    assert.match(msg, /deviceId.*≠.*firmware.*mv_f2e689fd60d96bab/);
    assert.doesNotMatch(msg, /No fresh telemetry/);
    registry.removeDevice(mvId);
  });

  it('detects legacy driver id from ateccSerial without fresh registry', () => {
    const msg = cmdFailureHint(null, {
      hubBrokerUrl: 'mqtt://192.168.1.233:1883',
      deviceId: 'opta_0123b636f1c23964ee',
      registry,
      ateccSerial: '0123b636f1c23964ee',
    });
    assert.match(msg, /mv_f2e689fd60d96bab/);
  });

  it('deviceIdMismatchHint returns empty when ids align', () => {
    assert.equal(deviceIdMismatchHint('opta_test', registry), '');
  });
});

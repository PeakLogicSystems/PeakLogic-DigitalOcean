'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isDraginoPayload,
  parseDraginoTopic,
  draginoToParcReport,
  modbusRegistersFromHex,
  draginoSubscribePattern,
  draginoCloudMqttTopics,
  enrichDraginoReportForCloud,
} = require('../src/parc/draginoTelemetry');

describe('draginoTelemetry', () => {
  it('detects Dragino JSON uplink', () => {
    assert.equal(isDraginoPayload({ Model: 'RS485-NB', Payload: '0108b4' }), true);
    assert.equal(isDraginoPayload({ IMEI: '863663062798815', Payload: '0108b4' }), true);
    assert.equal(isDraginoPayload({ deviceId: 'opta_01', tags: [] }), false);
  });

  it('parses dragino/{segment}/uplink topic', () => {
    const cfg = { dragino: { enabled: true, topicPrefix: 'dragino', topicSuffix: 'uplink', deviceIdPrefix: 'dragino_' } };
    assert.deepEqual(parseDraginoTopic('dragino/pump01/uplink', cfg), {
      segment: 'pump01',
      deviceId: 'dragino_pump01',
    });
    assert.equal(parseDraginoTopic('peaklogic/v1/dragino_01/telemetry', cfg), null);
  });

  it('draginoSubscribePattern returns wildcard when enabled', () => {
    assert.equal(
      draginoSubscribePattern({ dragino: { enabled: true } }),
      'dragino/+/uplink',
    );
    assert.equal(draginoSubscribePattern({ dragino: { enabled: false } }), null);
  });

  it('decodes Modbus FC03 registers from payload hex', () => {
    const tags = modbusRegistersFromHex('010304000100020008');
    assert.equal(tags.length, 2);
    assert.equal(tags[0].id, 'MB_REG_1');
    assert.equal(tags[0].value, 1);
    assert.equal(tags[1].id, 'MB_REG_2');
    assert.equal(tags[1].value, 2);
  });

  it('draginoToParcReport maps cellular and modbus tags', () => {
    const report = draginoToParcReport({
      Model: 'RS485-NB',
      IMEI: '863663062798815',
      Payload: '010304000100020008',
      battery: 3.605,
      signal: 25,
      time: '2024/12/11 09:34:15',
    }, 'dragino_pump01');

    assert.equal(report.deviceId, 'dragino_pump01');
    assert.equal(report.platform, 'dragino-rs485-nb');
    assert.ok(report.tags.some((t) => t.id === 'CELL_SIGNAL' && t.value === 25));
    assert.ok(report.tags.some((t) => t.id === 'CELL_BATTERY_V' && t.value === 3.605));
    assert.ok(report.tags.some((t) => t.id === 'MB_REG_1'));
  });

  it('draginoCloudMqttTopics builds flat and tenant Parc paths', () => {
    const cfg = { topicPrefix: 'peaklogic/v1' };
    assert.deepEqual(draginoCloudMqttTopics(cfg, 'dragino_pump01'), {
      pubTopic: 'peaklogic/v1/dragino_pump01/telemetry',
      subTopic: 'peaklogic/v1/dragino_pump01/downlink',
      flat: true,
    });
    assert.deepEqual(
      draginoCloudMqttTopics(cfg, 'dragino_pump01', 'acme-corp'),
      {
        pubTopic: 'peaklogic/v1/acme-corp/dragino_pump01/telemetry',
        subTopic: 'peaklogic/v1/acme-corp/dragino_pump01/downlink',
        flat: false,
      },
    );
  });

  it('enrichDraginoReportForCloud adds tenant meta', () => {
    const out = enrichDraginoReportForCloud({ deviceId: 'dragino_01', tags: [] }, {
      tenantId: 'acme-corp',
    });
    assert.equal(out.meta.tenantId, 'acme-corp');
    assert.equal(out.meta.gatewayRole, 'cellular_rs485');
  });
});

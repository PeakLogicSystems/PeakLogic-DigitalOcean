'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildModbusReadCommand,
  buildDraginoGatewayPlan,
  resolveDraginoCloudBroker,
} = require('../src/parc/draginoGatewayCommission');

describe('draginoGatewayCommission', () => {
  it('buildModbusReadCommand formats FC03 with CRC flag', () => {
    assert.equal(buildModbusReadCommand({
      slaveId: 1,
      functionCode: 3,
      startRegister: 0,
      registerCount: 4,
    }), '01 03 0000 0004,1');
  });

  it('resolveDraginoCloudBroker maps localhost hub to public cloud host', () => {
    const broker = resolveDraginoCloudBroker({}, { brokerUrl: 'mqtt://127.0.0.1:1883' });
    assert.equal(broker.host, 'peaklogic.io');
    assert.equal(broker.port, 1883);
  });

  it('buildDraginoGatewayPlan returns AT commands and mqtt topics', () => {
    const plan = buildDraginoGatewayPlan({
      deviceId: 'dragino_pump01',
      tenantId: 'acme-corp',
      presetId: 'dfrobot_sen0706_ec',
      slaveId: 1,
    }, { topicPrefix: 'peaklogic/v1' });

    assert.equal(plan.role, 'rs485_mqtt_gateway');
    assert.equal(plan.reportIntervalSec, 300);
    assert.ok(plan.atCommands.some((c) => c === 'AT+TDC=300'));
    assert.equal(plan.passthrough.supported, false);
    assert.ok(plan.modbusMap);
    assert.equal(plan.modbusMap.presetId, 'dfrobot_sen0706_ec');
    assert.ok(plan.modbusMap.tags.some((t) => t.id === 'EC_US_CM'));
    assert.ok(plan.atCommands.some((c) => c.startsWith('AT+COMMAND1=')));
  });

  it('opta_parc_modbus_dragino plan uses 5-minute TDC from template', () => {
    const plan = buildDraginoGatewayPlan({
      deviceId: 'dragino_opta_01',
      presetId: 'opta_parc_modbus_dragino',
      slaveId: 2,
    }, { topicPrefix: 'peaklogic/v1' });

    assert.equal(plan.reportIntervalSec, 300);
    assert.ok(plan.atCommands.includes('AT+TDC=300'));
    assert.equal(plan.modbusMap.presetId, 'opta_parc_modbus_dragino');
  });
});

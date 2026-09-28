'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { optaBrokerHint, appendOptaBrokerHint } = require('../src/parc/mqttBrokerHint');

describe('mqttBrokerHint', () => {
  it('optaBrokerHint returns setup hint', () => {
    const h = optaBrokerHint();
    assert.ok(h.pcBrokerUrl.startsWith('mqtt://'));
    assert.ok(h.optaSetupHint.includes('127.0.0.1'));
  });

  it('appendOptaBrokerHint adds hint when missing', () => {
    const out = appendOptaBrokerHint('MQTT command timeout');
    assert.match(out, /g_mqttCfg|broker/i);
  });
});

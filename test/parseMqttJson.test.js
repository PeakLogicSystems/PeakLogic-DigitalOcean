'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMqttJson, sanitizeMqttJsonText } = require('../src/parc/parseMqttJson');

describe('parseMqttJson', () => {
  it('parses valid JSON unchanged', () => {
    const obj = parseMqttJson('{"deviceId":"opta_1","tags":[]}');
    assert.equal(obj.deviceId, 'opta_1');
  });

  it('repairs unescaped control characters inside strings', () => {
    const bad = '{"deviceId":"opta_1","name":"line\nbreak"}';
    const obj = parseMqttJson(bad);
    assert.equal(obj.deviceId, 'opta_1');
    assert.equal(obj.name, 'line break');
  });

  it('strips null bytes', () => {
    const bad = '{"deviceId":"opta_1","meta":{"serial":"AB\u0000CD"}}';
    const obj = parseMqttJson(bad);
    assert.equal(obj.meta.serial, 'ABCD');
  });

  it('sanitizeMqttJsonText preserves structure outside strings', () => {
    const s = sanitizeMqttJsonText('{\n "a": 1\n}');
    assert.equal(JSON.parse(s).a, 1);
  });
});

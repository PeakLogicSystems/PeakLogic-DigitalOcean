'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parsePayload, formatPayloadForWrite, tagValueFromParsed } = require('../src/drivers/payloadTemplate');

describe('payloadTemplate', () => {
  it('parses bool and number templates', () => {
    assert.equal(parsePayload('true', 'bool'), true);
    assert.equal(parsePayload('OFF', 'bool'), false);
    assert.equal(parsePayload('42.5', 'number'), 42.5);
  });

  it('parses json path template', () => {
    assert.equal(parsePayload('{"value":7}', 'json:value'), 7);
  });

  it('formats write payloads', () => {
    assert.equal(formatPayloadForWrite(true, 'bool'), '1');
    assert.equal(formatPayloadForWrite(3, 'json'), '{"value":3}');
  });

  it('maps parsed values to tag types', () => {
    assert.equal(tagValueFromParsed({ type: 'BOOL' }, '1'), true);
    assert.equal(tagValueFromParsed({ type: 'INT' }, '9'), 9);
  });
});

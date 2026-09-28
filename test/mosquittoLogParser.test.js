'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMosquittoLogLine,
  parseMosquittoLogLines,
} = require('../src/mqtt/mosquittoLogParser');
const mosquittoLogIngest = require('../src/mqtt/mosquittoLogIngest');
const mongoSysLog = require('../src/logger/mongoSysLog');

describe('mosquittoLogParser', () => {
  it('parses device connect with client id', () => {
    const entry = parseMosquittoLogLine(
      '1700000001: New client connected from 192.168.1.50:54321 as mv_opta_01 (p2, c1, k60).',
    );
    assert.ok(entry);
    assert.equal(entry.category, 'mqtt');
    assert.equal(entry.level, 'info');
    assert.equal(entry.detail.event, 'client_connect');
    assert.equal(entry.detail.clientId, 'mv_opta_01');
    assert.equal(entry.detail.ip, '192.168.1.50');
    assert.match(entry.message, /mv_opta_01/);
  });

  it('parses auth failure', () => {
    const entry = parseMosquittoLogLine(
      '1700000002: Client <unknown> disconnected, not authorised.',
    );
    assert.ok(entry);
    assert.equal(entry.level, 'warn');
    assert.equal(entry.detail.event, 'auth_fail');
    assert.match(entry.message, /auth failed/i);
  });

  it('parses disconnect and socket error', () => {
    const disc = parseMosquittoLogLine('1700000003: Client mv_opta_01 disconnected.');
    assert.equal(disc.detail.event, 'client_disconnect');
    const err = parseMosquittoLogLine('1700000004: Socket error on client mv_opta_01, disconnecting.');
    assert.equal(err.level, 'error');
    assert.equal(err.detail.event, 'error');
  });

  it('ignores broker startup noise', () => {
    assert.equal(parseMosquittoLogLine('1700000005: mosquitto version 2.0.18 starting'), null);
  });
});

describe('mosquittoLogIngest', () => {
  it('ingests parsed lines into sys_log fallback', async () => {
    await mongoSysLog.setConfig(null);
    const lines = [
      '1700000010: New client connected from 10.0.0.8:44001 as device_a (p2, c1, k60).',
      '1700000011: Client <unknown> disconnected, not authorised.',
    ];
    const result = await mosquittoLogIngest.ingestLines(lines, { host: 'test-broker' });
    assert.equal(result.ingested, 2);
    const rows = await mongoSysLog.query({ category: 'mqtt' }, { limit: 10 });
    assert.ok(rows.some((r) => r.detail?.clientId === 'device_a'));
    assert.ok(rows.some((r) => r.detail?.event === 'auth_fail'));
  });
});

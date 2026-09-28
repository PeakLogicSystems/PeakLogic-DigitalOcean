'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  APP_VERSION,
  OPTA_PROTOCOL_VERSION,
  semverCompare,
  checkOptaDeviceStatus,
  clientDeployMeta,
  clientHeaders,
  buildSyncTimeBody,
  crc16Modbus,
  bcDeployCrc,
} = require('../src/drivers/optaProtocol');

describe('optaProtocol', () => {
  it('exports matching client meta', () => {
    assert.equal(clientDeployMeta().protocolVersion, OPTA_PROTOCOL_VERSION);
    assert.equal(clientDeployMeta().clientVersion, APP_VERSION);
    assert.ok(Number(clientDeployMeta().clientTimeUnix) > 1577836800);
    assert.equal(clientHeaders()['X-MV-Protocol-Version'], String(OPTA_PROTOCOL_VERSION));
    assert.ok(Number(clientHeaders()['X-MV-Client-Time']) > 1577836800);
    const named = clientDeployMeta({ programName: 'logic/demo.st' });
    assert.equal(named.programName, 'logic/demo.st');
  });

  it('clientDeployMeta includes autoRunOnBoot when requested', () => {
    const named = clientDeployMeta({ programName: 'logic/demo.st', autoRunOnBoot: true });
    assert.equal(named.autoRunOnBoot, true);
    assert.equal(clientDeployMeta({ autoRunOnBoot: false }).autoRunOnBoot, undefined);
  });

  it('bcDeployCrc matches modbus CRC16 over bytecode buffer', () => {
    const buf = Buffer.from([0x4d, 0x56, 0x42, 0x43, 0x01, 0x00]);
    const crc = crc16Modbus(buf);
    assert.equal(bcDeployCrc(buf.toString('base64')), crc);
    assert.ok(crc > 0);
  });

  it('buildSyncTimeBody uses workspace IANA timezone (Eastern)', () => {
    const summer = new Date('2026-06-20T15:30:00.000Z').getTime();
    const winter = new Date('2026-01-15T15:30:00.000Z').getTime();
    const summerBody = buildSyncTimeBody(summer, 'America/New_York');
    const winterBody = buildSyncTimeBody(winter, 'America/New_York');
    assert.equal(summerBody.unixUtc, Math.floor(summer / 1000));
    assert.equal(summerBody.tzOffsetMin, 240); // EDT
    assert.equal(winterBody.tzOffsetMin, 300); // EST
    assert.equal(buildSyncTimeBody(summer, 'UTC').tzOffsetMin, 0);
    assert.ok(summerBody.unixUtc > 1577836800);
  });

  it('accepts matching device status', () => {
    const r = checkOptaDeviceStatus({
      ok: true,
      protocolVersion: OPTA_PROTOCOL_VERSION,
      firmwareVersion: APP_VERSION,
    });
    assert.equal(r.ok, true);
    assert.equal(r.errors.length, 0);
  });

  it('rejects protocol mismatch', () => {
    const r = checkOptaDeviceStatus({
      ok: true,
      protocolVersion: 99,
      firmwareVersion: APP_VERSION,
    });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /Protocol mismatch/);
  });

  it('warns when firmware version fields missing', () => {
    const r = checkOptaDeviceStatus({ ok: true });
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some((w) => /protocolVersion/.test(w)));
    assert.ok(r.warnings.some((w) => /firmwareVersion/.test(w)));
  });

  it('semverCompare orders versions', () => {
    assert.ok(semverCompare('2.3.7', '2.3.6') > 0);
    assert.ok(semverCompare('2.3.7', '2.3.7') === 0);
    assert.ok(semverCompare('2.2.0', '2.3.7') < 0);
  });
});

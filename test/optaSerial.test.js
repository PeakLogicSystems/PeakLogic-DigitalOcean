'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAteccSerialHex,
  mvDeviceIdFromAteccSerial,
  legacyOptaDeviceIdFromAteccSerial,
  deviceIdFromAteccSerial,
  isMvDeviceId,
  isLegacyOptaDeviceId,
  isAteccDeviceId,
  fnv1a64Bytes,
  ateccSerialToBytes,
} = require('../src/parc/optaSerial');

/** Golden vector: ATECC serial 01:23:55:b5:2d:66:a1:09:ee */
const GOLDEN_SERIAL = '012355b52d66a109ee';

describe('optaSerial mv_ identity Phase 1', () => {
  it('normalizes 18-digit hex serial', () => {
    assert.equal(normalizeAteccSerialHex('012355B52D66A109EE'), '012355b52d66a109ee');
    assert.equal(normalizeAteccSerialHex('01:23:55:b5:2d:66:a1:09:ee'), '012355b52d66a109ee');
  });

  it('FNV-1a 64 golden vector matches firmware algorithm', () => {
    const bytes = ateccSerialToBytes(GOLDEN_SERIAL);
    assert.ok(bytes);
    assert.equal(bytes.length, 9);
    const hash = fnv1a64Bytes(bytes);
    assert.equal(hash.toString(16).padStart(16, '0'), '38265a7868b4ad48');
    assert.equal(mvDeviceIdFromAteccSerial(GOLDEN_SERIAL), 'mv_38265a7868b4ad48');
  });

  it('deviceIdFromAteccSerial returns mv_ format', () => {
    assert.equal(deviceIdFromAteccSerial(GOLDEN_SERIAL), 'mv_38265a7868b4ad48');
  });

  it('legacy opta_ id still available', () => {
    assert.equal(
      legacyOptaDeviceIdFromAteccSerial(GOLDEN_SERIAL),
      'opta_012355b52d66a109ee',
    );
  });

  it('detects mv_ and legacy opta_ device ids', () => {
    assert.equal(isMvDeviceId('mv_38265a7868b4ad48'), true);
    assert.equal(isLegacyOptaDeviceId('opta_012355b52d66a109ee'), true);
    assert.equal(isAteccDeviceId('mv_38265a7868b4ad48'), true);
    assert.equal(isAteccDeviceId('opta_012355b52d66a109ee'), true);
    assert.equal(isAteccDeviceId('opta_st_01'), false);
  });
});

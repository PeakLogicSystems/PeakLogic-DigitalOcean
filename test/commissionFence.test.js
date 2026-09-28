'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  tryParseSiteKey,
  formatSiteKeyHex,
  formatSiteKeyDigits,
  extractGlobalSiteKeyFromReport,
  deviceGlobalSiteKey,
  visibleKeysForTenant,
  deviceMatchesFence,
  deviceAllowedOnTenant,
  allocateUniqueSiteKey,
} = require('../src/parc/commissionFence');

describe('commissionFence (global site key)', () => {
  it('parses hex, decimal, and 6-digit entry forms', () => {
    assert.equal(tryParseSiteKey('0x0001'), 1);
    assert.equal(tryParseSiteKey('1'), 1);
    assert.equal(tryParseSiteKey('000001'), 1);
    assert.equal(tryParseSiteKey('0xABCD'), 0xabcd);
    assert.equal(tryParseSiteKey('065535'), 65535);
    assert.equal(tryParseSiteKey(''), null);
    assert.equal(tryParseSiteKey('999999'), null);
  });

  it('formats hex and 6-digit display from the same key', () => {
    assert.equal(formatSiteKeyHex(1), '0x0001');
    assert.equal(formatSiteKeyDigits(1), '000001');
    assert.equal(formatSiteKeyDigits(0xabcd), '043981');
  });

  it('extracts globalSiteKey from Opta telemetry, not a separate code', () => {
    assert.equal(extractGlobalSiteKeyFromReport({ globalSiteKey: 1 }), 1);
    assert.equal(extractGlobalSiteKeyFromReport({ meta: { globalSiteKey: '0x0002' } }), 2);
    assert.equal(extractGlobalSiteKeyFromReport({ commissionCode: '000003' }), 3);
    assert.equal(extractGlobalSiteKeyFromReport({
      deviceId: 'mv_opta_01',
      platform: 'arduino-opta-mqtt-st',
      globalSiteKey: 16,
      globalAddrKey: '0010',
    }), 16);
    assert.equal(extractGlobalSiteKeyFromReport({ tags: [] }), null);
  });

  it('fences devices to the viewing org key only', () => {
    const device = { meta: { globalSiteKey: 0x0010 } };
    assert.equal(deviceGlobalSiteKey(device), 0x0010);
    assert.equal(deviceMatchesFence(device, new Set([0x0010])), true);
    assert.equal(deviceMatchesFence(device, new Set([0x0001])), false);
    assert.equal(deviceMatchesFence({ meta: {} }, new Set([0x0001])), false);
    const keys = visibleKeysForTenant({ globalSiteKey: 5, partnerId: 'p1' });
    assert.deepEqual([...keys], [5]);
  });

  it('does not allow a global 01 Opta on a global 02 org website', () => {
    const opta01 = { deviceId: 'mv_db24bde03adc1470', meta: { globalSiteKey: 1 } };
    const org02 = { globalSiteKey: 2 };
    const org01 = { globalSiteKey: 1 };
    assert.equal(deviceAllowedOnTenant(opta01, org02), false);
    assert.equal(deviceAllowedOnTenant(opta01, org01), true);
    assert.equal(deviceAllowedOnTenant({ meta: {} }, org02), true);
  });

  it('allocates unused 16-bit keys', () => {
    const taken = new Set([1, 2, 4]);
    assert.equal(allocateUniqueSiteKey(taken), 3);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_GLOBAL_SITE_KEY,
  normalizeSiteKey,
  siteKeyToAddrKey,
  globalTopic,
  validateSiteKey,
} = require('../src/parc/globalAddressKey');

describe('globalAddressKey', () => {
  it('defaults unset siteKey to 0x0001', () => {
    assert.equal(normalizeSiteKey(undefined), DEFAULT_GLOBAL_SITE_KEY);
    assert.equal(normalizeSiteKey(null), DEFAULT_GLOBAL_SITE_KEY);
    assert.equal(normalizeSiteKey(''), DEFAULT_GLOBAL_SITE_KEY);
    assert.equal(siteKeyToAddrKey(undefined), '0001');
  });

  it('formats siteKey as 4 lowercase hex digits', () => {
    assert.equal(siteKeyToAddrKey(0x0001), '0001');
    assert.equal(siteKeyToAddrKey(1), '0001');
    assert.equal(siteKeyToAddrKey(0xabcd), 'abcd');
    assert.equal(siteKeyToAddrKey('0xABCD'), 'abcd');
    assert.equal(siteKeyToAddrKey(0xffff), 'ffff');
  });

  it('builds global MQTT topics', () => {
    const cfg = { topicPrefix: 'peaklogic/v1' };
    assert.equal(
      globalTopic(cfg, 0x0001, 'PumpRun'),
      'peaklogic/v1/g/0001/PumpRun',
    );
    assert.equal(
      globalTopic(cfg, 0xabcd, 'TankLevel'),
      'peaklogic/v1/g/abcd/TankLevel',
    );
    assert.equal(
      globalTopic({ topicPrefix: 'plant/mv/v2/' }, 42, 'DI1'),
      'plant/mv/v2/g/002a/DI1',
    );
  });

  it('rejects invalid site keys', () => {
    assert.throws(() => validateSiteKey(0), /0x0001/);
    assert.throws(() => validateSiteKey(0x10000), /0x0001/);
    assert.throws(() => globalTopic({}, 0, 'x'), /0x0001/);
    assert.throws(() => globalTopic({}, 1, ''), /tagName required/);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { resolveUrl, tagPath } = require('../src/drivers/httpsDriver');

describe('httpsDriver helpers', () => {
  it('resolveUrl joins base and path', () => {
    assert.equal(resolveUrl('https://api.example.com', '/v1/temp'), 'https://api.example.com/v1/temp');
    assert.equal(resolveUrl('https://api.example.com/', 'v1/temp'), 'https://api.example.com/v1/temp');
    assert.equal(resolveUrl('', 'https://other.com/x'), 'https://other.com/x');
  });

  it('tagPath prefers url then path then topic', () => {
    assert.equal(tagPath({ driverAddress: { url: '/a' } }), '/a');
    assert.equal(tagPath({ driverAddress: { path: '/b' } }), '/b');
    assert.equal(tagPath({ driverAddress: { topic: '/c' } }), '/c');
  });
});

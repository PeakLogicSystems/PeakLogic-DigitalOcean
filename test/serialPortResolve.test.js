'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveFromPortList } = require('../src/system/serialPortResolve');

describe('resolveFromPortList', () => {
  const ports = [
    { path: 'COM11', label: 'COM11', usb: true },
    { path: 'COM12', label: 'COM12', usb: true },
  ];

  it('uses configured port when present', () => {
    const r = resolveFromPortList('COM11', ports);
    assert.equal(r.path, 'COM11');
    assert.equal(r.fallback, false);
  });

  it('does not fallback to a port reserved by another driver', () => {
    const r = resolveFromPortList('COM3', ports, ['COM11']);
    assert.equal(r.path, 'COM12');
    assert.equal(r.fallback, true);
  });

  it('fails gracefully when only reserved ports are available', () => {
    const r = resolveFromPortList('COM3', [{ path: 'COM11', usb: true }], ['COM11']);
    assert.equal(r.path, 'COM3');
    assert.equal(r.fallback, true);
    assert.match(r.reason, /reserved by other drivers/);
  });
});

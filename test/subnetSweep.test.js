'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hostsForInterface,
  hitFromOpenPort,
  needsSetupHit,
  tcpPortOpen,
} = require('../src/cameras/subnetSweep');

describe('subnetSweep', () => {
  it('lists /24 hosts excluding self', () => {
    const hosts = hostsForInterface({ address: '192.168.1.88', netmask: '255.255.255.0' });
    assert.equal(hosts.length, 253);
    assert.ok(hosts.includes('192.168.1.1'));
    assert.ok(hosts.includes('192.168.1.254'));
    assert.ok(!hosts.includes('192.168.1.88'));
  });

  it('builds ONVIF hit from open port', () => {
    const hit = hitFromOpenPort('192.168.1.50', 8000);
    assert.equal(hit.host, '192.168.1.50');
    assert.equal(hit.port, 8000);
    assert.equal(hit.onvifUrl, 'http://192.168.1.50:8000/onvif/device_service');
    assert.equal(hit.discoveryMethod, 'subnet-sweep');
  });

  it('tcpPortOpen returns false for unreachable host', async () => {
    const ok = await tcpPortOpen('192.0.2.1', 8000, 200);
    assert.equal(ok, false);
  });

  it('flags a Reolink native-port device as needing ONVIF setup', () => {
    const hit = needsSetupHit('192.168.1.65', [9000]);
    assert.equal(hit.host, '192.168.1.65');
    assert.equal(hit.needsSetup, true);
    assert.equal(hit.onvifDisabled, true);
    assert.equal(hit.vendor, 'reolink');
    assert.equal(hit.manufacturer, 'Reolink');
    assert.equal(hit.onvifUrl, '');
    assert.deepEqual(hit.openPorts, [9000]);
    assert.match(hit.note, /ONVIF/);
  });

  it('marks non-Reolink native detection without a vendor', () => {
    const hit = needsSetupHit('192.168.1.70', [554]);
    assert.equal(hit.needsSetup, true);
    assert.equal(hit.vendor, '');
    assert.equal(hit.manufacturer, '');
  });

  it('estimates sweep timeout for a /24 scan', () => {
    const { estimateSweepTimeoutMs } = require('../src/cameras/subnetSweep');
    const ms = estimateSweepTimeoutMs({
      interfaces: [{ address: '10.0.0.5', netmask: '255.255.255.0' }],
      ports: [8000, 80],
      detectPorts: [9000, 554],
    });
    assert.ok(ms >= 12000);
  });
});

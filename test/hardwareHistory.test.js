'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-hw-'));

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { inferSwapType, profileFromRegistryDev } = require('../src/hardware/deviceProfile');
const hardwareHistoryStore = require('../src/hardware/hardwareHistoryStore');

describe('deviceProfile', () => {
  it('inferSwapType detects cross-vendor and like-for-like', () => {
    assert.equal(
      inferSwapType(
        { vendor: 'Arduino', model: 'Opta', deviceId: 'a' },
        { vendor: 'Wago', model: 'PFC200', deviceId: 'b' },
      ),
      'cross_vendor',
    );
    assert.equal(
      inferSwapType(
        { vendor: 'Arduino', model: 'Opta', deviceId: 'a' },
        { vendor: 'Arduino', model: 'Opta', deviceId: 'b' },
      ),
      'like_for_like',
    );
    assert.equal(
      inferSwapType(
        { vendor: 'Arduino', model: 'Opta', deviceId: 'a' },
        { vendor: 'Arduino', model: 'Opta Lite', deviceId: 'b' },
      ),
      'upgrade',
    );
  });

  it('profileFromRegistryDev maps Opta platform', () => {
    const p = profileFromRegistryDev({
      deviceId: 'opta_0123b636f1c23964ee',
      platform: 'arduino-opta-mqtt-st',
      ateccSerial: '0123b636f1c23964ee',
    }, { type: 'mqtt_parc', deviceId: 'opta_0123b636f1c23964ee' });
    assert.equal(p.vendor, 'Arduino');
    assert.equal(p.model, 'Opta');
    assert.equal(p.serialNumber, '0123b636f1c23964ee');
  });
});

describe('hardwareHistoryStore', () => {
  before(async () => {
    await hardwareHistoryStore.setConfig(null);
  });

  after(async () => {
    await hardwareHistoryStore.close();
  });

  it('records commission and hardware swap in fallback store', async () => {
    await hardwareHistoryStore.recordCommission({
      positionId: 'motor_skid_main',
      positionName: 'Motor skid',
      registryDev: {
        deviceId: 'opta_0123b636f1c23964ee',
        platform: 'arduino-opta-mqtt-st',
        ateccSerial: '0123b636f1c23964ee',
      },
      driver: { type: 'mqtt_parc', deviceId: 'opta_0123b636f1c23964ee' },
      note: 'initial install',
    });
    let current = await hardwareHistoryStore.getCurrentAssignment('motor_skid_main');
    assert.equal(current.serialNumber, '0123b636f1c23964ee');
    assert.equal(current.swapType, 'commission');

    await hardwareHistoryStore.recordHardwareSwap({
      positionId: 'motor_skid_main',
      outgoingDriver: { type: 'mqtt_parc', deviceId: 'opta_0123b636f1c23964ee', vendor: 'Arduino', model: 'Opta' },
      outgoingRegistryDev: { deviceId: 'opta_0123b636f1c23964ee', platform: 'arduino-opta-mqtt-st', ateccSerial: '0123b636f1c23964ee' },
      incomingRegistryDev: {
        deviceId: 'opta_newserial00000001',
        platform: 'arduino-opta-mqtt-st',
        ateccSerial: 'newserial00000001',
      },
      incomingDriver: { type: 'mqtt_parc', deviceId: 'opta_newserial00000001' },
      swapType: 'like_for_like',
      note: 'RMA swap',
    });

    const rows = await hardwareHistoryStore.listByPosition('motor_skid_main', { limit: 10 });
    assert.ok(rows.length >= 2);
    current = await hardwareHistoryStore.getCurrentAssignment('motor_skid_main');
    assert.equal(current.serialNumber, 'newserial00000001');
    assert.equal(current.swapType, 'like_for_like');

    const bySerial = await hardwareHistoryStore.listBySerial('0123b636f1c23964ee');
    assert.ok(bySerial.some((r) => r.removedAt));
  });

  it('records cross-vendor upgrade with explicit vendor/model', async () => {
    await hardwareHistoryStore.recordHardwareSwap({
      positionId: 'mcc1_line3',
      outgoingDriver: { type: 'mqtt_parc', vendor: 'Arduino', model: 'Opta' },
      outgoingRegistryDev: { platform: 'arduino-opta-mqtt-st', deviceId: 'opta_old', ateccSerial: 'oldserial000000001' },
      incomingRegistryDev: { deviceId: 'wago_pfc200_01', platform: 'wago-pfc' },
      incomingDriver: { type: 'mqtt_parc', deviceId: 'wago_pfc200_01' },
      vendor: 'Wago',
      model: 'PFC200',
      swapType: 'cross_vendor',
      note: 'panel upgrade',
    });
    const current = await hardwareHistoryStore.getCurrentAssignment('mcc1_line3');
    assert.equal(current.vendor, 'Wago');
    assert.equal(current.model, 'PFC200');
    assert.equal(current.swapType, 'cross_vendor');
  });

  it('listRecent returns assignments across positions', async () => {
    const rows = await hardwareHistoryStore.listRecent({ limit: 20 });
    assert.ok(rows.length >= 2);
    assert.ok(rows.some((r) => r.positionId === 'motor_skid_main'));
    assert.ok(rows.some((r) => r.positionId === 'mcc1_line3'));
    const times = rows.map((r) => r.installedAt);
    const sorted = [...times].sort((a, b) => String(b).localeCompare(String(a)));
    assert.deepEqual(times, sorted);
  });
});

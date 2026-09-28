'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  MSG,
  PROTOCOL_VERSION,
  redactCameraForCloud,
  parseMessage,
  encodeMessage,
} = require('../src/cloud/agentProtocol');
const { siteStore, hashToken, cameraKey } = require('../src/cloud/siteStore');

const TEST_SITE = `plant_ut_${Date.now()}`;

describe('agentProtocol', () => {
  it('redacts camera without password or rtsp secrets', () => {
    const row = redactCameraForCloud({
      cameraId: 'ipc_65',
      name: 'IPC',
      host: '192.168.1.65',
      port: 8000,
      model: 'RLC-520A',
      password: 'secret',
      rtspUrl: 'rtsp://admin:secret@192.168.1.65:554/h264Preview_01_sub',
      probeStatus: 'ok',
      hasStream: true,
    }, 'plant_a');
    assert.equal(row.siteId, 'plant_a');
    assert.equal(row.cameraId, 'ipc_65');
    assert.equal(row.password, undefined);
    assert.equal(row.rtspUrl, undefined);
    assert.match(row.viewerPath, /\/api\/sites\/plant_a\/cameras\/ipc_65\/player/);
  });

  it('encodes and parses control messages', () => {
    const raw = encodeMessage(MSG.INVENTORY, { cameras: [] });
    const msg = parseMessage(raw);
    assert.equal(msg.type, MSG.INVENTORY);
    assert.equal(msg.v, PROTOCOL_VERSION);
    assert.ok(Array.isArray(msg.cameras));
  });
});

describe('siteStore', () => {
  after(() => {
    try { siteStore.deleteSite(TEST_SITE); } catch { /* ignore */ }
  });

  it('creates site with pairing code and authenticates', () => {
    const created = siteStore.createSite({ siteId: TEST_SITE, name: 'Plant Unit Test' });
    assert.equal(created.site.siteId, TEST_SITE);
    assert.ok(created.pairingCode);
    assert.ok(created.agentToken);
    assert.ok(siteStore.authenticatePairing(TEST_SITE, created.pairingCode));
    assert.ok(siteStore.authenticateAgentToken(TEST_SITE, created.agentToken));
    assert.equal(siteStore.authenticatePairing(TEST_SITE, 'wrong'), null);
  });

  it('merges inventory and rotates agent token on pair', () => {
    siteStore.mergeInventory(TEST_SITE, [
      redactCameraForCloud({
        cameraId: 'ipc_65',
        name: 'IPC',
        host: '192.168.1.65',
        probeStatus: 'ok',
        hasStream: true,
      }, TEST_SITE),
    ]);
    const cams = siteStore.listCameras(TEST_SITE);
    assert.equal(cams.length, 1);
    assert.equal(cams[0].cameraId, 'ipc_65');
    assert.equal(cameraKey(TEST_SITE, 'ipc_65'), `${TEST_SITE}|ipc_65`);

    const rotated = siteStore.rotateAgentToken(TEST_SITE);
    assert.ok(rotated.agentToken);
    assert.ok(siteStore.authenticateAgentToken(TEST_SITE, rotated.agentToken));
  });

  it('hashes tokens stably', () => {
    assert.equal(hashToken('abc'), hashToken('abc'));
    assert.notEqual(hashToken('abc'), hashToken('abd'));
  });

  it('enforces max viewers setting default', () => {
    const s = siteStore.settings();
    assert.ok(s.maxViewersPerSite >= 1);
    assert.equal(s.entitlementRemoteView, true);
  });
});

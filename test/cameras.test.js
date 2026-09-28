'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CameraRegistry, parseHostPort } = require('../src/cameras/cameraRegistry');
const { parseProbeMatch, parseScopes, dedupeHits, localIpv4Interfaces, broadcastForIface } = require('../src/cameras/onvifDiscover');
const { mediaProfiles, pickProfile } = require('../src/cameras/onvifClient');
const {
  isReolinkHit,
  buildRtspUrl,
  normalizeReolinkRtspUrl,
  expandDiscoveryHits,
  viewerUrlForCamera,
} = require('../src/cameras/reolink');
const { applyProbeToRecord } = require('../src/cameras/cameraProbe');
const { buildDigestAuth, parseDigestChallenge } = require('../src/cameras/onvifHttp');
describe('cameraRegistry', () => {
  it('creates and lists a manual camera', () => {
    const reg = new CameraRegistry();
    const id = `cam_test_${Date.now()}`;
    const cam = reg.createCamera({
      cameraId: id,
      name: 'Test Cam',
      host: '192.168.1.50',
      port: 80,
      viewerUrl: 'https://192.168.1.50/view',
    });
    assert.equal(cam.cameraId, id);
    assert.equal(cam.host, '192.168.1.50');
    const row = reg.listCameras().find((c) => c.cameraId === id);
    assert.ok(row);
    assert.equal(row.name, 'Test Cam');
    assert.equal(row.hasCredentials, false);
  });

  it('merges discovered cameras and updates lastSeen', () => {
    const reg = new CameraRegistry();
    const hostA = `10.0.0.${(Date.now() % 200) + 5}`;
    const hostB = `10.0.0.${(Date.now() % 200) + 50}`;
    reg.createCamera({
      cameraId: `cam_a_${Date.now()}`,
      name: 'Existing',
      host: hostA,
      port: 80,
      onvifUrl: `http://${hostA}/onvif/device_service`,
    });
    const merge = reg.mergeDiscovered([
      {
        host: hostA,
        port: 80,
        onvifUrl: `http://${hostA}/onvif/device_service`,
        name: 'Discovered name',
        manufacturer: 'Acme',
        model: 'Cam 100',
        onvifProfile: 'T',
      },
      {
        host: hostB,
        port: 80,
        onvifUrl: `http://${hostB}/onvif/device_service`,
        name: 'New cam',
      },
    ], { autoAdd: true });
    assert.equal(merge.updated.length, 1);
    assert.equal(merge.added.length, 1);
    assert.equal(merge.updated[0].manufacturer, 'Acme');
    assert.ok(reg.listCameras().some((c) => c.host === hostB));
  });
});

describe('parseHostPort', () => {
  it('parses host and port from URL', () => {
    assert.deepEqual(parseHostPort('http://192.168.1.10:8080/onvif/device_service'), {
      host: '192.168.1.10',
      port: 8080,
    });
  });
});

describe('onvifDiscover parsers', () => {
  it('parses scopes for profile and hardware', () => {
    const scopes = 'onvif://www.onvif.org/name/TestCam onvif://www.onvif.org/hardware/Acme%20ModelX onvif://www.onvif.org/Profile/T';
    const info = parseScopes(scopes);
    assert.equal(info.name, 'TestCam');
    assert.equal(info.hardware, 'Acme ModelX');
    assert.deepEqual(info.profiles, ['T']);
  });

  it('parses probe match xml', () => {
    const xml = `<?xml version="1.0"?>
<Envelope>
  <Body>
    <ProbeMatches>
      <ProbeMatch>
        <EndpointReference><Address>uuid:abc</Address></EndpointReference>
        <Types>dn:NetworkVideoTransmitter</Types>
        <Scopes>onvif://www.onvif.org/name/YardCam onvif://www.onvif.org/Profile/T</Scopes>
        <XAddrs>http://192.168.1.20:80/onvif/device_service</XAddrs>
      </ProbeMatch>
    </ProbeMatches>
  </Body>
</Envelope>`;
    const hit = parseProbeMatch(xml, { address: '192.168.1.20' });
    assert.equal(hit.host, '192.168.1.20');
    assert.equal(hit.port, 80);
    assert.equal(hit.onvifProfile, 'T');
    assert.equal(hit.name, 'YardCam');
  });

  it('computes subnet broadcast for an interface', () => {
    assert.equal(broadcastForIface({ address: '192.168.1.88', netmask: '255.255.255.0' }), '192.168.1.255');
    assert.equal(broadcastForIface({ address: '10.0.5.20', netmask: '255.255.0.0' }), '10.0.255.255');
    assert.equal(broadcastForIface({ address: 'nope', netmask: '255.255.255.0' }), null);
  });

  it('enumerates local IPv4 interfaces with broadcast', () => {
    const ifaces = localIpv4Interfaces();
    assert.ok(Array.isArray(ifaces));
    for (const i of ifaces) {
      assert.equal(typeof i.address, 'string');
      assert.ok(i.broadcast === null || typeof i.broadcast === 'string');
    }
  });

  it('dedupes discovery hits by host/port/url', () => {
    const hits = dedupeHits([
      { host: '1.1.1.1', port: 80, onvifUrl: 'http://1.1.1.1/onvif/device_service' },
      { host: '1.1.1.1', port: 80, onvifUrl: 'http://1.1.1.1/onvif/device_service' },
      { host: '1.1.1.2', port: 80, onvifUrl: 'http://1.1.1.2/onvif/device_service' },
    ]);
    assert.equal(hits.length, 2);
  });
});

describe('reolink helpers', () => {
  it('detects reolink from scopes', () => {
    assert.equal(isReolinkHit({ manufacturer: 'Reolink' }), true);
    assert.equal(isReolinkHit({ model: 'RLC-520A' }), true);
    assert.equal(isReolinkHit({ name: 'Front Door' }), false);
  });

  it('builds Reolink RTSP substream URL', () => {
    const url = buildRtspUrl({ host: '192.168.1.88', username: 'admin', password: 'secret', stream: 'sub' });
    assert.equal(url, 'rtsp://admin:secret@192.168.1.88:554/h264Preview_01_sub');
  });

  it('normalizes incomplete Reolink GetStreamUri result', () => {
    const url = normalizeReolinkRtspUrl('rtsp://192.168.1.88:554/', {
      host: '192.168.1.88',
      username: 'admin',
      password: 'secret',
      preferSubstream: true,
    });
    assert.equal(url, 'rtsp://admin:secret@192.168.1.88:554/h264Preview_01_sub');
  });

  it('injects credentials into credential-less Onvif GetStreamUri URLs', () => {
    const url = normalizeReolinkRtspUrl('rtsp://192.168.1.65:554/Preview_01_sub', {
      host: '192.168.1.65',
      username: 'admin',
      password: 'secret',
      preferSubstream: true,
    });
    assert.equal(url, 'rtsp://admin:secret@192.168.1.65:554/h264Preview_01_sub');
  });

  it('expands discovery with port 8000 candidates', () => {
    const expanded = expandDiscoveryHits([
      { host: '10.0.0.20', port: 80, onvifUrl: 'http://10.0.0.20/onvif/device_service', manufacturer: 'Reolink' },
    ]);
    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].port, 8000);
    assert.equal(expanded[0].vendor, 'reolink');
  });

  it('builds viewer URL for MJPEG proxy', () => {
    assert.equal(viewerUrlForCamera('cam_yard'), '/api/cameras/cam_yard/mjpeg');
  });

  it('builds viewer URL for go2rtc player', () => {
    assert.equal(
      viewerUrlForCamera('cam_yard', { backend: 'go2rtc' }),
      '/api/cameras/cam_yard/player',
    );
  });
});

describe('onvifClient parsers', () => {
  it('parses media profiles from GetProfiles xml', () => {
    const xml = `<Profiles token="prof_sub"><Name>subStream</Name></Profiles>
<Profiles token="prof_main"><Name>mainStream</Name></Profiles>`;
    const profiles = mediaProfiles(xml);
    assert.equal(profiles.length, 2);
    assert.equal(pickProfile(profiles, true).token, 'prof_sub');
  });
});

describe('cameraProbe apply', () => {
  it('applies successful probe to record', () => {
    const rec = { cameraId: 'cam1', host: '10.0.0.1', name: 'Yard' };
    const next = applyProbeToRecord(rec, {
      ok: true,
      vendor: 'reolink',
      rtspUrl: 'rtsp://admin:pass@10.0.0.1:554/h264Preview_01_sub',
      snapshotUrl: 'http://10.0.0.1:8000/cgi-bin/snapshot.cgi',
      viewerUrl: '/api/cameras/cam1/mjpeg',
      manufacturer: 'Reolink',
      model: 'RLC-810A',
      probedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(next.vendor, 'reolink');
    assert.equal(next.probeStatus, 'ok');
    assert.equal(next.viewerUrl, '/api/cameras/cam1/mjpeg');
  });
});

describe('go2rtc client helpers', () => {
  const { renderPlayerHtml, renderPlayerSetupHtml, streamNameForCamera, playerPagePath } = require('../src/cameras/go2rtcClient');

  it('uses camera id as stream name', () => {
    assert.equal(streamNameForCamera('cam_yard'), 'cam_yard');
  });

  it('builds player page path', () => {
    assert.equal(playerPagePath('cam_yard'), '/api/cameras/cam_yard/player');
  });

  it('renders player html with video-stream and go2rtc WebSocket URL', () => {
    const html = renderPlayerHtml('cam_yard', { proxyBase: '/api/go2rtc' });
    assert.match(html, /\/api\/go2rtc\/video-stream\.js/);
    assert.match(html, /\/api\/go2rtc\/api\/ws\?src=cam_yard/);
  });

  it('renders setup html when stream is missing', () => {
    const html = renderPlayerSetupHtml('cam_yard', 'Camera has no RTSP URL — run Probe first.');
    assert.match(html, /Camera not streaming/);
    assert.match(html, /run Probe first/);
    assert.match(html, /cam_yard/);
  });
});

describe('onvifHttp digest', () => {
  it('parses digest challenge and builds auth header', () => {
    const ch = parseDigestChallenge('Digest realm="Login to 8A00001PAZ00001", nonce="abc123", qop="auth"');
    assert.equal(ch.realm, 'Login to 8A00001PAZ00001');
    const auth = buildDigestAuth({
      username: 'admin',
      password: 'secret',
      method: 'POST',
      uri: '/onvif/device_service',
      challenge: ch,
      nc: '00000002',
      cnonce: 'deadbeef',
    });
    assert.match(auth, /^Digest username="admin"/);
    assert.match(auth, /response="/);
  });
});

describe('camera discover sweep ports', () => {
  const { resolveSweepPorts, probeCameraIds } = require('../src/api/routes/cameras');
  const { estimateSweepTimeoutMs } = require('../src/cameras/subnetSweep');

  it('uses configured ONVIF port plus port 80', () => {
    assert.deepEqual(resolveSweepPorts({ onvifPort: 8000 }, {}), [8000, 80]);
  });

  it('dedupes when ONVIF port is 80', () => {
    assert.deepEqual(resolveSweepPorts({ onvifPort: 80 }, {}), [80]);
  });

  it('honors explicit sweepPorts from request body', () => {
    assert.deepEqual(resolveSweepPorts({ onvifPort: 8000 }, { sweepPorts: [9000, 554] }), [9000, 554]);
  });

  it('estimates sweep timeout from host and port count', () => {
    const ms = estimateSweepTimeoutMs({
      interfaces: [{ address: '192.168.1.10', netmask: '255.255.255.0' }],
      ports: [8000, 80],
      detectPorts: [9000, 554],
      concurrency: 48,
      connectTimeoutMs: 350,
    });
    assert.ok(ms >= 12000);
    assert.ok(ms <= 90000);
  });

  it('probeCameraIds returns empty for no ids', async () => {
    const result = await probeCameraIds([], {});
    assert.deepEqual(result, { probed: [] });
  });
});

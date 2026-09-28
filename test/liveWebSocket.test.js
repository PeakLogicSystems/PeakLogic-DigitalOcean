'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { wsIntervalMs, buildLivePayload, LIVE_WS_PATH } = require('../src/live/liveWebSocket');
const { TagStore } = require('../src/tags/tagStore');
const { DriverManager } = require('../src/drivers');
const { ScanEngine } = require('../src/runtime/scanEngine');
const { GraphHistory } = require('../src/runtime/graphHistory');

describe('liveWebSocket', () => {
  it('uses dedicated path that does not overlap go2rtc proxy', () => {
    assert.equal(LIVE_WS_PATH, '/api/live');
    assert.ok(!LIVE_WS_PATH.startsWith('/api/go2rtc'));
  });

  it('scales push interval with tag count', () => {
    assert.equal(wsIntervalMs(100), 250);
    assert.equal(wsIntervalMs(500), 250);
    assert.equal(wsIntervalMs(501), 500);
    assert.equal(wsIntervalMs(2000), 500);
    assert.equal(wsIntervalMs(2001), 1000);
  });

  it('buildLivePayload includes slim live snapshot', () => {
    const tagStore = new TagStore();
    tagStore.upsert({ id: 'T1', type: 'REAL', role: 'memory', value: 1.5 });
    const driverManager = new DriverManager(tagStore);
    const graphHistory = new GraphHistory();
    const scanEngine = new ScanEngine(tagStore, driverManager, graphHistory);
    const payload = buildLivePayload({ tagStore, driverManager, scanEngine });
    assert.ok(payload.tagCount >= 1);
    assert.equal(Array.isArray(payload.live), true);
    const row = payload.live.find((r) => r.tagId === 'T1');
    assert.equal(row?.value, 1.5);
    assert.equal(payload.runtime.running, false);
    assert.equal(row.label, undefined);
  });

  it('HTTP GET /api/live and client getLive exist as poll fallback', () => {
    const fs = require('fs');
    const path = require('path');
    const dashboard = fs.readFileSync(path.join(__dirname, '../src/api/routes/dashboard.js'), 'utf8');
    const apiJs = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(dashboard, /router\.get\('\/live'/);
    assert.match(apiJs, /getLive:/);
    assert.match(appJs, /api\.getLive/);
    assert.match(serverJs, /attachLiveWebSocket/);
  });

  it('extractToken reads cookie when req.query is missing (raw WS upgrade)', () => {
    const { extractToken } = require('../src/tenants/authMiddleware');
    const token = extractToken({
      url: '/api/live',
      headers: { cookie: 'mv_session=ws-cookie-token' },
    });
    assert.equal(token, 'ws-cookie-token');
    const fromUrl = extractToken({
      url: '/api/live?token=url-token',
      headers: {},
    });
    assert.equal(fromUrl, 'url-token');
  });

  it('accepts WebSocket upgrade at /api/live', async () => {
    const http = require('http');
    const { WebSocket } = require('ws');
    const { attachLiveWebSocket } = require('../src/live/liveWebSocket');
    const tagStore = new TagStore();
    tagStore.upsert({ id: 'WS_HANDSHAKE', type: 'REAL', role: 'memory', value: 9 });
    const driverManager = new DriverManager(tagStore);
    const graphHistory = new GraphHistory();
    const scanEngine = new ScanEngine(tagStore, driverManager, graphHistory);
    const server = http.createServer((_req, res) => res.end('ok'));
    attachLiveWebSocket(server, { tagStore, driverManager, scanEngine });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/live`);
    const first = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS handshake timeout')), 4000);
      ws.once('error', reject);
      ws.once('message', (buf) => {
        clearTimeout(timer);
        resolve(JSON.parse(String(buf)));
      });
    });
    ws.close();
    await new Promise((resolve) => server.close(resolve));
    assert.equal(Array.isArray(first.live), true);
    assert.equal(first.live.find((r) => r.tagId === 'WS_HANDSHAKE')?.value, 9);
  });

  it('duplex 3D page declares selectedZone before first use', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(
      path.join(__dirname, '../public/samples/duplex-lift-station-ortho-3d.html'),
      'utf8',
    );
    const decl = html.indexOf('let selectedZone');
    const firstUse = html.search(/\bselectedZone\b/);
    assert.ok(decl >= 0, 'selectedZone must be declared');
    assert.ok(firstUse >= decl, 'selectedZone must not be accessed before initialization');
  });
});

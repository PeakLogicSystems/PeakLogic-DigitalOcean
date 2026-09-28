'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  buildPortalUrl,
  buildPortalLoginUrl,
  PORTAL_BASE_URL,
} = require('../src/drivers/nextcenturyAuth');
const {
  createPortalSession,
  getPortalSession,
  clearPortalSessionsForTests,
} = require('../src/drivers/nextcenturyPortalSession');
const { createNextcenturyPortalRoutes, renderPortalFrameHtml } = require('../src/routes/nextcenturyPortal');
const { createDriverRoutes } = require('../src/api/routes/drivers');
const { DriverManager } = require('../src/drivers');
const { TagStore } = require('../src/tags/tagStore');

describe('nextcentury portal', () => {
  beforeEach(() => {
    clearPortalSessionsForTests();
  });

  it('buildPortalUrl encodes token in hash route', () => {
    const url = buildPortalUrl('jwt+test/token');
    assert.equal(url, `${PORTAL_BASE_URL}/#/login?token=jwt%2Btest%2Ftoken`);
  });

  it('buildPortalLoginUrl points at portal login page', () => {
    assert.equal(buildPortalLoginUrl(), `${PORTAL_BASE_URL}/login`);
  });

  it('portal session expires and frame route returns 404 when missing', async () => {
    const app = express();
    app.use(createNextcenturyPortalRoutes());
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/nextcentury-portal/frame/missing`);
      assert.equal(res.status, 404);
      const text = await res.text();
      assert.match(text, /expired or invalid/i);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('frame route renders iframe src with token handoff URL', async () => {
    const { sessionId } = createPortalSession({
      token: 'abc123',
      email: 'user@example.com',
      driverId: 'nextcentury1',
    });
    const html = renderPortalFrameHtml(getPortalSession(sessionId));
    assert.match(html, /user@example\.com/);
    assert.match(html, /abc123/);
    assert.match(html, /sandbox=/);
    assert.doesNotMatch(html, /allow-same-origin/);
    assert.match(html, /allow-scripts/);
    assert.match(html, /app\.nextcenturymeters\.com/);
  });

  it('POST /drivers/nextcentury/portal-session logs in and returns frame path', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (String(url).includes('api.nextcenturymeters.com/login')) {
        return { ok: true, json: async () => ({ token: 'portal-jwt' }) };
      }
      return originalFetch(url, opts);
    };

    const tagStore = new TagStore();
    const driverManager = new DriverManager(tagStore);
    driverManager.save([{
      id: 'nextcentury1',
      type: 'nextcentury',
      enabled: true,
      email: 'ops@example.com',
      password: 'secret',
    }]);

    const app = express();
    app.use(express.json());
    app.use('/api', createDriverRoutes({ tagStore, driverManager, scanEngine: null }));
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/drivers/nextcentury/portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: 'nextcentury1' }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
      assert.match(data.framePath, /^\/nextcentury-portal\/frame\//);
      assert.equal(data.email, 'ops@example.com');
      assert.ok(getPortalSession(data.sessionId));
    } finally {
      global.fetch = originalFetch;
      await new Promise((r) => server.close(r));
    }
  });
});

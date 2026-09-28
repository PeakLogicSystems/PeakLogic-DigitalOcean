'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createDriverRoutes } = require('../src/api/routes/drivers');
const { DriverManager } = require('../src/drivers');
const { TagStore } = require('../src/tags/tagStore');

async function postDriverTest(body) {
  const tagStore = new TagStore();
  const driverManager = new DriverManager(tagStore);
  const deps = { tagStore, driverManager, scanEngine: null };
  const app = express();
  app.use(express.json());
  app.use('/api', createDriverRoutes(deps));
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/drivers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('POST /drivers/test', () => {
  it('returns health for mock driver', async () => {
    const r = await postDriverTest({ id: 'mock1', type: 'mock', enabled: false });
    assert.equal(r.status, 200);
    assert.ok(r.data.result);
  });

  it('returns 400 for unknown driver type', async () => {
    const r = await postDriverTest({ id: 'bad', type: 'not_a_driver', enabled: false });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /Unknown driver type/i);
  });

  it('returns 400 when mqtt_parc cannot connect', async () => {
    const r = await postDriverTest({ type: 'mqtt_parc', enabled: false, deviceId: '', id: '' });
    assert.equal(r.status, 400);
    assert.ok(r.data.error);
    assert.match(r.data.error, /deviceId required|MQTT Parc hub/i);
  });
});

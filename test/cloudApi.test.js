'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let baseUrl;
let httpServer;

function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* empty */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('cloud API (MongoDB)', () => {
  before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB = 'mooreview_cloud_test';
    process.env.JWT_SECRET = 'test-jwt-secret-min-32-chars-long';
    process.env.NODE_ENV = 'test';

    const { resetMongo, connectMongo } = require('../src/db/mongo');
    await resetMongo();
    await connectMongo();
    const { ensureIndexes } = require('../src/db/indexes');
    await ensureIndexes();

    const { createCloudApp } = require('../src/api/cloudApp');
    httpServer = createCloudApp().listen(0, '127.0.0.1', () => {
      const { port } = httpServer.address();
      baseUrl = `http://127.0.0.1:${port}`;
    });
    await new Promise((resolve) => httpServer.once('listening', resolve));
  });

  after(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    const { closeMongo } = require('../src/db/mongo');
    await closeMongo();
    if (mongod) await mongod.stop();
  });

  it('health returns ok', async () => {
    const res = await request('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
  });

  it('signup → location → system → device', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Acme Water',
        tenantSlug: 'acme',
        email: 'admin@acme.test',
        password: 'password123',
      },
    });
    assert.equal(signup.status, 201);
    assert.ok(signup.json.token);
    const token = signup.json.token;

    const loc = await request('POST', '/api/locations', {
      token,
      body: { name: 'Plant A', slug: 'plant-a' },
    });
    assert.equal(loc.status, 201);
    const locationId = loc.json.location.id;

    const sys = await request('POST', `/api/locations/${locationId}/systems`, {
      token,
      body: { name: 'Line 1', slug: 'line-1' },
    });
    assert.equal(sys.status, 201);
    const systemId = sys.json.system.id;

    const dev = await request('POST', `/api/systems/${systemId}/devices`, {
      token,
      body: { name: 'DO Probe', slug: 'do-probe', driverType: 'modbus_rtu' },
    });
    assert.equal(dev.status, 201);
    assert.equal(dev.json.device.driverType, 'modbus_rtu');

    const list = await request('GET', `/api/systems/${systemId}/devices`, { token });
    assert.equal(list.status, 200);
    assert.equal(list.json.devices.length, 1);
  });

  it('login requires tenant slug', async () => {
    const res = await request('POST', '/api/auth/login', {
      body: { tenantSlug: 'acme', email: 'admin@acme.test', password: 'password123' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.json.token);
  });
});

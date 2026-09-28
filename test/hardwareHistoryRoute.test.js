'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-hw-route-'));

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHardwareHistoryRoutes } = require('../src/api/routes/hardwareHistory');
const hardwareHistoryStore = require('../src/hardware/hardwareHistoryStore');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    json(payload) {
      this.body = payload;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

async function getRecent(limit = 50) {
  const router = createHardwareHistoryRoutes({ driverManager: { list: () => [] } });
  const layer = router.stack.find((s) => s.route?.path === '/hardware-history' && s.route.methods.get);
  assert.ok(layer, 'GET /hardware-history route exists');
  const handler = layer.route.stack[0].handle;
  const req = { query: { recent: '1', limit: String(limit) } };
  const res = mockRes();
  await handler(req, res);
  return res;
}

describe('hardwareHistory route', () => {
  before(async () => {
    await hardwareHistoryStore.setConfig(null);
    await hardwareHistoryStore.recordCommission({
      positionId: 'route_test_pos',
      registryDev: { deviceId: 'opta_route01', ateccSerial: 'route01serial00001' },
      driver: { type: 'mqtt_parc', deviceId: 'opta_route01' },
    });
  });

  after(async () => {
    await hardwareHistoryStore.close();
  });

  it('GET /hardware-history?recent=1 lists recent assignments', async () => {
    const res = await getRecent(10);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.ok(Array.isArray(res.body.assignments));
    assert.ok(res.body.assignments.some((r) => r.positionId === 'route_test_pos'));
  });
});

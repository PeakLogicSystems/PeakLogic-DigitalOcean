'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-syslog-'));

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { runWithContext, userFromRequest } = require('../src/logger/sysLogContext');
const mongoSysLog = require('../src/logger/mongoSysLog');

describe('sysLogContext', () => {
  it('userFromRequest reads cloud headers', () => {
    const user = userFromRequest({
      headers: {
        'x-peaklogic-user-id': 'u42',
        'x-peaklogic-user-email': 'tech@example.com',
        'x-peaklogic-user-name': 'Tech User',
        'x-peaklogic-user-role': 'admin',
      },
    });
    assert.equal(user.id, 'u42');
    assert.equal(user.email, 'tech@example.com');
    assert.equal(user.role, 'admin');
  });
});

describe('mongoSysLog', () => {
  before(async () => {
    await mongoSysLog.setConfig(null);
  });

  after(async () => {
    await mongoSysLog.close();
  });

  it('records error and maintenance entries in fallback store', async () => {
    await mongoSysLog.append({ level: 'error', category: 'test', message: 'boom', detail: { code: 1 } });
    await mongoSysLog.append({ level: 'maintenance', category: 'test', message: 'serviced' });
    const rows = await mongoSysLog.query({ level: 'error' }, { limit: 10 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].message, 'boom');
  });

  it('attaches user context from async local storage (cloud)', async () => {
    await runWithContext({
      user: { id: 'u99', email: 'ops@plant.com', name: 'Ops', role: 'operator' },
      tenantId: 'tenant_a',
    }, async () => {
      const entry = await mongoSysLog.append({
        level: 'maintenance',
        category: 'hardware',
        message: 'Replaced Opta at motor_skid_main',
        detail: { positionId: 'motor_skid_main' },
      });
      assert.equal(entry.user.id, 'u99');
      assert.equal(entry.user.email, 'ops@plant.com');
      assert.equal(entry.tenantId, 'tenant_a');
    });
    const rows = await mongoSysLog.query({ category: 'hardware' }, { limit: 5, userId: 'u99' });
    assert.ok(rows.some((r) => r.message.includes('motor_skid_main')));
  });
});

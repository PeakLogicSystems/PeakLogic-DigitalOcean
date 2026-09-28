'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_CONFIG_URI = 'memory';
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-cloud-sims-'));
process.env.PEAKLOGIC_CLOUD_SIMS = '1';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const configStore = require('../src/configStore');
configStore.initMemorySync();
const persistence = require('../src/persistence');
const { normalizeSimInput, defaultDeviceId } = require('../src/cloud/simSchema');
const { buildSimTelemetry } = require('../src/cloud/simTelemetry');
const simStore = require('../src/cloud/simStore');
const { createCloudSimRoutes } = require('../src/api/routes/cloudSims');

describe('simSchema', () => {
  it('normalizes opta sim input with defaults', () => {
    const sim = normalizeSimInput({ name: 'Demo', tenantId: 'acme', type: 'opta' });
    assert.equal(sim.name, 'Demo');
    assert.equal(sim.tenantId, 'acme');
    assert.equal(sim.type, 'opta');
    assert.equal(sim.status, 'stopped');
    assert.ok(sim.mqttDeviceId.startsWith('sim_opta_'));
    assert.equal(sim.config.intervalMs, 2000);
  });

  it('rejects invalid tenantId', () => {
    assert.throws(
      () => normalizeSimInput({ name: 'X', tenantId: 'bad tenant!', type: 'opta' }),
      /tenantId/,
    );
  });
});

describe('simTelemetry', () => {
  it('builds oscillating Opta tags', () => {
    const sim = normalizeSimInput({ name: 'T', tenantId: 'demo', type: 'opta' });
    const r0 = buildSimTelemetry(sim, 0);
    const r1 = buildSimTelemetry(sim, 1);
    assert.equal(r0.deviceId, sim.mqttDeviceId);
    assert.ok(r0.tags.find((t) => t.id === 'I1'));
    assert.notEqual(
      r0.tags.find((t) => t.id === 'I1').value,
      r1.tags.find((t) => t.id === 'I1').value,
    );
    assert.equal(r0.meta.source, 'peaklogic-cloud-sim');
  });

  it('builds modbus register tags', () => {
    const sim = normalizeSimInput({
      name: 'M',
      tenantId: 'demo',
      type: 'modbus',
      config: { registers: [{ address: 40001, value: 10 }] },
    });
    const report = buildSimTelemetry(sim, 5);
    assert.ok(report.tags.some((t) => t.id === 'HR40001'));
  });
});

describe('simStore fallback', () => {
  before(() => {
    simStore.resetFallbackForTests([]);
  });

  after(async () => {
    await simStore.close();
  });

  it('creates, lists, updates, and deletes sims in JSON fallback', async () => {
    const created = await simStore.create({
      name: 'Store test',
      tenantId: 'tenant_a',
      type: 'opta',
      mqttDeviceId: defaultDeviceId('opta'),
    });
    assert.ok(created.id.startsWith('sim_'));
    const listed = await simStore.list();
    assert.equal(listed.length, 1);
    const updated = await simStore.update(created.id, { name: 'Renamed' });
    assert.equal(updated.name, 'Renamed');
    const removed = await simStore.remove(created.id);
    assert.equal(removed, true);
    assert.equal((await simStore.list()).length, 0);
  });
});

async function withApi(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api', createCloudSimRoutes());
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api/cloud/sims`;
  try {
    return await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('cloudSettings', () => {
  const { normalizeCloudSimsSettings } = require('../src/cloud/cloudSettings');

  it('honors explicit enabled true from settings save', () => {
    assert.deepEqual(normalizeCloudSimsSettings({ enabled: true }, {}), { enabled: true });
  });

  it('honors explicit enabled false even when previously enabled', () => {
    assert.deepEqual(
      normalizeCloudSimsSettings({ enabled: false }, { enabled: true }),
      { enabled: false },
    );
  });

  it('defaults enabled from PEAKLOGIC_CLOUD_SIMS env', () => {
    const prev = process.env.PEAKLOGIC_CLOUD_SIMS;
    process.env.PEAKLOGIC_CLOUD_SIMS = '1';
    try {
      assert.deepEqual(normalizeCloudSimsSettings(undefined, {}), { enabled: true });
    } finally {
      if (prev === undefined) delete process.env.PEAKLOGIC_CLOUD_SIMS;
      else process.env.PEAKLOGIC_CLOUD_SIMS = prev;
    }
  });
});

describe('cloud sim API', () => {
  before(() => {
    simStore.resetFallbackForTests([]);
  });

  after(async () => {
    await simStore.close();
  });

  it('CRUD via REST routes', async () => {
    await withApi(async (base) => {
      const createRes = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'API Sim', tenantId: 'demo-tenant', type: 'opta' }),
      });
      assert.equal(createRes.status, 201);
      const { sim } = await createRes.json();
      assert.equal(sim.name, 'API Sim');

      const listRes = await fetch(base);
      const listData = await listRes.json();
      assert.equal(listData.count, 1);

      const getRes = await fetch(`${base}/${sim.id}`);
      assert.equal(getRes.status, 200);

      const putRes = await fetch(`${base}/${sim.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      assert.equal(putRes.status, 200);

      const delRes = await fetch(`${base}/${sim.id}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);
    });
  });

  it('returns 403 when cloud sims disabled', async () => {
    delete process.env.PEAKLOGIC_CLOUD_SIMS;
    persistence.writeJson('settings.json', { cloudSims: { enabled: false } });
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/cloud/cloudSimsEnabled')];
    delete require.cache[require.resolve('../src/api/routes/cloudSims')];
    const { createCloudSimRoutes: gatedRoutes } = require('../src/api/routes/cloudSims');
    const app = express();
    app.use(express.json());
    app.use('/api', gatedRoutes());
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cloud/sims`);
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
      process.env.PEAKLOGIC_CLOUD_SIMS = '1';
      delete require.cache[require.resolve('../src/config')];
      delete require.cache[require.resolve('../src/cloud/cloudSimsEnabled')];
      delete require.cache[require.resolve('../src/api/routes/cloudSims')];
    }
  });

  it('allows cloud sims when settings.cloudSims.enabled is true', async () => {
    delete process.env.PEAKLOGIC_CLOUD_SIMS;
    persistence.writeJson('settings.json', { cloudSims: { enabled: true } });
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/cloud/cloudSimsEnabled')];
    delete require.cache[require.resolve('../src/api/routes/cloudSims')];
    const { isCloudSimsEnabled } = require('../src/cloud/cloudSimsEnabled');
    assert.equal(isCloudSimsEnabled(), true);
    process.env.PEAKLOGIC_CLOUD_SIMS = '1';
    delete require.cache[require.resolve('../src/cloud/cloudSimsEnabled')];
  });
});

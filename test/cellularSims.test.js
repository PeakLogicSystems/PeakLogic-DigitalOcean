'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-cellular-sims-'));
process.env.PEAKLOGIC_CELLULAR_SIMS = '1';

const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const persistence = require('../src/persistence');
const { normalizeSimRecord, normalizeStatus, simRecordId } = require('../src/cellular/simRecordSchema');
const { mapHologramState } = require('../src/cellular/vendors/hologram');
const { mapTwilioStatus } = require('../src/cellular/vendors/twilioWireless');
const { mapJasperStatus } = require('../src/cellular/vendors/jasperControlCenter');
const { mapVerizonStatus } = require('../src/cellular/vendors/verizon');
const { HologramAdapter } = require('../src/cellular/vendors/hologram');
const { TwilioWirelessAdapter } = require('../src/cellular/vendors/twilioWireless');
const { AttAdapter } = require('../src/cellular/vendors/att');
const { VerizonAdapter } = require('../src/cellular/vendors/verizon');
const { TmobileAdapter } = require('../src/cellular/vendors/tmobile');
const { SimetryAdapter, mapSimetryStatus } = require('../src/cellular/vendors/simetry');
const { listVendorDefinitions, isVendorImplemented } = require('../src/cellular/vendors');
const simStore = require('../src/cellular/simStore');
const simManager = require('../src/cellular/simManager');
const { registry } = require('../src/parc/deviceRegistry');
const { writeCellularSimsSettings } = require('../src/cellular/cellularSettings');
const { createCellularSimRoutes } = require('../src/api/routes/cellularSims');
const { buildBillingReport, billingReportToCsv } = require('../src/cellular/simBilling');

describe('simRecordSchema', () => {
  it('normalizes sim record with stable id', () => {
    const sim = normalizeSimRecord({
      iccid: '8901000000000000001',
      vendor: 'hologram',
      vendorSimId: '42',
      status: 'LIVE',
    });
    assert.equal(sim.iccid, '8901000000000000001');
    assert.equal(sim.vendor, 'hologram');
    assert.equal(sim.status, 'active');
    assert.equal(sim.id, simRecordId('hologram', '8901000000000000001'));
  });

  it('maps vendor status strings', () => {
    assert.equal(normalizeStatus('LIVE'), 'active');
    assert.equal(normalizeStatus('PAUSED-USER'), 'paused');
    assert.equal(mapHologramState('DEAD'), 'deactivated');
    assert.equal(mapTwilioStatus('new'), 'inactive');
    assert.equal(mapJasperStatus('ACTIVATED'), 'active');
    assert.equal(mapJasperStatus('ACTIVATION_READY'), 'inactive');
    assert.equal(mapVerizonStatus('suspended'), 'paused');
    assert.equal(mapSimetryStatus({ deviceStatus: 'ONLINE', suspended: false }), 'active');
    assert.equal(mapSimetryStatus({ deviceStatus: 'STOPPED' }), 'paused');
    assert.equal(mapSimetryStatus({ suspended: true }), 'paused');
  });
});

describe('vendor registry', () => {
  it('lists implemented and stub vendors', () => {
    const defs = listVendorDefinitions();
    assert.equal(defs.length, 11);
    assert.ok(defs.some((d) => d.id === 'hologram' && d.implemented));
    assert.ok(defs.some((d) => d.id === 'twilio' && d.implemented));
    assert.ok(defs.some((d) => d.id === 'att' && d.implemented && !d.stub));
    assert.ok(defs.some((d) => d.id === 'verizon' && d.implemented && !d.stub));
    assert.ok(defs.some((d) => d.id === 'tmobile' && d.implemented && !d.stub));
    assert.ok(defs.some((d) => d.id === 'simetry' && d.implemented && !d.stub));
    assert.ok(defs.some((d) => d.id === 'emnify' && d.stub));
    assert.ok(defs.some((d) => d.id === '1nce' && d.stub));
    const hologram = defs.find((d) => d.id === 'hologram');
    const twilio = defs.find((d) => d.id === 'twilio');
    assert.equal(hologram?.displayName, 'Hologram');
    assert.equal(twilio?.displayName, 'Twilio Super SIM');
    assert.equal(isVendorImplemented('hologram'), true);
    assert.equal(isVendorImplemented('att'), true);
    assert.equal(isVendorImplemented('simetry'), true);
    assert.equal(isVendorImplemented('telnyx'), false);
  });

  it('exposes config schemas for carrier vendors', () => {
    const defs = listVendorDefinitions();
    const att = defs.find((d) => d.id === 'att');
    const verizon = defs.find((d) => d.id === 'verizon');
    const tmobile = defs.find((d) => d.id === 'tmobile');
    assert.ok(att.configSchema.some((f) => f.key === 'baseUrl' && f.required));
    assert.ok(att.configSchema.some((f) => f.key === 'apiKey' && f.secret));
    assert.ok(verizon.configSchema.some((f) => f.key === 'appKey'));
    assert.ok(verizon.configSchema.some((f) => f.key === 'accountName'));
    assert.ok(tmobile.configSchema.some((f) => f.key === 'accountId'));
    const simetry = defs.find((d) => d.id === 'simetry');
    assert.ok(simetry.configSchema.some((f) => f.key === 'apiKey' && f.secret));
    assert.ok(simetry.configSchema.some((f) => f.key === 'apiSecret' && f.secret));
  });
});

function mockSimetryFetch(handlers = {}) {
  return mock.fn(async (url, init) => {
    const u = String(url);
    if (u.includes('/operation-result')) {
      const data = handlers.operationResult || {
        success: true,
        entries: handlers.entries || [],
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    }
    if (u.includes('/esims/enable') || u.includes('/esims/disable')) {
      assert.equal(init.method, 'POST');
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, requestId: 'req-enable' }) };
    }
    if (u.includes('/data-consumption/data')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, requestId: 'req-usage' }) };
    }
    if (u.includes('/data-consumption/generate-esim-billing-preview')) {
      assert.equal(init.method, 'POST');
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, requestId: 'req-billing' }) };
    }
    if (u.includes('/data-consumption/generate-billing-invoice-preview')
      || u.includes('/data-consumption/generate-invoice-preview')) {
      assert.equal(init.method, 'POST');
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, requestId: 'req-invoice' }) };
    }
    if (u.includes('/plans')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, requestId: 'req-plans' }) };
    }
    if (u.includes('/esims')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, requestId: 'req-list' }) };
    }
    throw new Error(`unexpected simetry url ${u}`);
  });
}

describe('SimetryAdapter', () => {
  const creds = {
    apiKey: 'sim-key',
    apiSecret: 'sim-secret',
    baseUrl: 'https://integrationapi.teal.global/api/v1',
  };

  it('lists sims from mocked async Teal API', async () => {
    const fetchImpl = mockSimetryFetch({
      entries: [{
        id: 28001,
        iccid: '89019900000003070001',
        imsi: '234500024513001',
        msisdn: '234500024513001',
        eid: '89034011014200000000000000871001',
        planName: 'USA 1GB Plan',
        suspended: false,
        deviceStatus: 'ONLINE',
        deviceName: 'Pump skid',
      }],
    });

    const adapter = new SimetryAdapter(creds, { fetchImpl, pollDelayMs: 1 });
    const sims = await adapter.listSims();
    assert.equal(sims.length, 1);
    assert.equal(sims[0].iccid, '89019900000003070001');
    assert.equal(sims[0].status, 'active');
    assert.equal(sims[0].vendorSimId, '89034011014200000000000000871001');
    assert.match(String(fetchImpl.mock.calls[0].arguments[0]), /integrationapi\.teal\.global\/api\/v1\/esims/);
  });

  it('enables data consumption via async enable endpoint', async () => {
    const fetchImpl = mockSimetryFetch({
      operationResult: {
        success: true,
        entries: [{ success: true, eid: '89034011014200000000000000871001' }],
      },
    });

    const adapter = new SimetryAdapter(creds, { fetchImpl, pollDelayMs: 1 });
    const result = await adapter.activateSim('89034011014200000000000000871001');
    assert.equal(result.ok, true);
    assert.equal(result.status, 'active');
    const enableCall = fetchImpl.mock.calls.find((c) => String(c.arguments[0]).includes('/esims/enable'));
    assert.ok(enableCall);
    assert.deepEqual(JSON.parse(enableCall.arguments[1].body), {
      entries: ['89034011014200000000000000871001'],
    });
  });

  it('fetches monthly usage from data-consumption API', async () => {
    const eid = '89034011014200000000000000871001';
    let callIndex = 0;
    const fetchImpl = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/operation-result')) {
        if (callIndex === 0) {
          callIndex += 1;
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: true,
              entries: [{
                eid,
                iccid: '89019900000003070001',
                deviceStatus: 'ONLINE',
              }],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            entries: [{ eid, usage: 2097152 }],
          }),
        };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, requestId: 'req-x' }) };
    });

    const adapter = new SimetryAdapter(creds, { fetchImpl, pollDelayMs: 1 });
    const usage = await adapter.getUsage('89019900000003070001');
    assert.equal(usage.dataUsageMb, 2);
  });

  it('fetches esim billing preview and invoice preview', async () => {
    const eid = '89034011014200000000000000871001';
    let opCalls = 0;
    const fetchImpl = mock.fn(async (url, init) => {
      const u = String(url);
      if (u.includes('/operation-result')) {
        opCalls += 1;
        if (opCalls === 1) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: true,
              entries: [{
                success: true,
                eid,
                esimServiceFee: 1.5,
                total: 12.5,
                totalEsimUsage: 5242880,
                entries: [{
                  planUuid: 'plan-1',
                  planName: 'USA 1GB Plan',
                  planRate: 11,
                  usage: 5242880,
                  total: 11,
                }],
              }],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            entries: [{ totalPrice: 99.5, entries: [{ title: 'Plans', totalPrice: 99.5 }] }],
          }),
        };
      }
      if (u.includes('/data-consumption/generate-esim-billing-preview')) {
        assert.equal(init.method, 'POST');
      }
      if (u.includes('/data-consumption/generate-billing-invoice-preview')) {
        assert.equal(init.method, 'POST');
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, requestId: 'req-x' }) };
    });

    const adapter = new SimetryAdapter({
      ...creds,
      clientUuid: 'client-uuid-1',
    }, { fetchImpl, pollDelayMs: 1 });

    const previews = await adapter.getEsimBillingPreview({
      periodStart: '2026-08-01 00:00:00',
      periodEnd: '2026-08-11 00:00:00',
      eids: [eid],
    });
    assert.equal(previews.length, 1);
    assert.equal(previews[0].eid, eid);
    assert.equal(previews[0].usageMb, 5);
    assert.equal(previews[0].amount, 12.5);
    assert.equal(previews[0].serviceFee, 1.5);

    const invoice = await adapter.getInvoicePreview({ period: '2026-08-11 00:00:00' });
    assert.equal(invoice.totalPrice, 99.5);
  });
});

describe('HologramAdapter', () => {
  it('lists sims from mocked API response', async () => {
    const fetchImpl = mock.fn(async (url) => {
      assert.match(String(url), /hologram\.io\/api\/1\/devices/);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [{
            id: 100,
            name: 'Pump skid',
            links: {
              cellular: [{
                id: 200,
                sim: '8901000000000000001',
                imsi: 310410123456789,
                msisdn: '+15551234567',
                state: 'LIVE',
                planid: 999,
              }],
            },
          }],
        }),
      };
    });

    const adapter = new HologramAdapter({ apiKey: 'test-key', orgId: '1' }, { fetchImpl });
    const sims = await adapter.listSims();
    assert.equal(sims.length, 1);
    assert.equal(sims[0].iccid, '8901000000000000001');
    assert.equal(sims[0].status, 'active');
    assert.equal(sims[0].vendorSimId, '200');
  });

  it('activates link via state endpoint', async () => {
    const fetchImpl = mock.fn(async (url, init) => {
      if (String(url).includes('/state')) {
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(init.body), { state: 'live' });
        return { ok: true, status: 200, text: async () => '{}' };
      }
      return { ok: true, status: 200, text: async () => '{"data":[]}' };
    });
    const adapter = new HologramAdapter({ apiKey: 'k' }, { fetchImpl });
    const result = await adapter.activateSim('200');
    assert.equal(result.ok, true);
  });
});

describe('AttAdapter', () => {
  const creds = {
    baseUrl: 'https://rws-jpotest.jasper.com/rws/api/v1',
    username: 'user',
    apiKey: 'key',
    accountId: '100020620',
  };

  it('lists sims from mocked Jasper API', async () => {
    const fetchImpl = mock.fn(async (url) => {
      assert.match(String(url), /\/devices\?/);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          lastPage: true,
          devices: [{
            iccid: '8988216716970004971',
            imsi: '901161697004971',
            msisdn: '882351697004971',
            status: 'ACTIVATED',
            ratePlan: 'IoT Plan',
            ctdDataUsage: 1048576,
          }],
        }),
      };
    });
    const adapter = new AttAdapter(creds, { fetchImpl });
    const sims = await adapter.listSims();
    assert.equal(sims.length, 1);
    assert.equal(sims[0].iccid, '8988216716970004971');
    assert.equal(sims[0].status, 'active');
    assert.equal(sims[0].dataUsageMb, 1);
  });

  it('activates and deactivates via PUT device status', async () => {
    const fetchImpl = mock.fn(async (url, init) => {
      if (String(url).includes('/devices/8988216716970004971') && init?.method === 'PUT') {
        assert.deepEqual(JSON.parse(init.body), { status: 'ACTIVATED' });
        return { ok: true, status: 200, text: async () => '{"iccid":"8988216716970004971"}' };
      }
      return { ok: true, status: 200, text: async () => '{"devices":[]}' };
    });
    const adapter = new AttAdapter(creds, { fetchImpl });
    const result = await adapter.activateSim('8988216716970004971');
    assert.equal(result.ok, true);
  });

  it('fetches usage from ctdUsages endpoint', async () => {
    const fetchImpl = mock.fn(async (url) => {
      assert.match(String(url), /ctdUsages$/);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ctdDataUsage: 2097152 }),
      };
    });
    const adapter = new AttAdapter(creds, { fetchImpl });
    const usage = await adapter.getUsage('8988216716970004971');
    assert.equal(usage.dataUsageMb, 2);
  });
});

describe('TmobileAdapter', () => {
  it('uses Jasper Control Center endpoints', async () => {
    const fetchImpl = mock.fn(async (url) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        lastPage: true,
        devices: [{ iccid: '89011704252318147060', status: 'ACTIVATION_READY' }],
      }),
    }));
    const adapter = new TmobileAdapter({
      baseUrl: 'https://portal.example.com/rws/api/v1',
      username: 'u',
      apiKey: 'k',
      accountId: '42',
    }, { fetchImpl });
    const sims = await adapter.listSims();
    assert.equal(sims[0].status, 'inactive');
    assert.match(String(fetchImpl.mock.calls[0].arguments[0]), /portal\.example\.com/);
  });
});

describe('VerizonAdapter', () => {
  const creds = {
    appKey: 'app-key',
    appSecret: 'app-secret',
    uwsUsername: 'uws-user',
    uwsPassword: 'uws-pass',
    accountName: '0000123456-00001',
  };

  it('lists sims after OAuth and session login', async () => {
    const fetchImpl = mock.fn(async (url, init) => {
      const u = String(url);
      if (u.includes('/oauth2/token')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'oauth-tok' }) };
      }
      if (u.includes('/session/login')) {
        assert.equal(init.method, 'POST');
        return { ok: true, status: 200, text: async () => JSON.stringify({ sessionToken: 'sess-tok' }) };
      }
      if (u.includes('/devices/actions/list')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            devices: [{
              id: '12345',
              deviceIds: [
                { kind: 'iccid', id: '89148000000000000001' },
                { kind: 'msisdn', id: '+15551234567' },
              ],
              connectionStatus: 'active',
              carrierInformations: [{ servicePlan: 'IoT 1GB' }],
            }],
          }),
        };
      }
      throw new Error(`unexpected url ${u}`);
    });

    const adapter = new VerizonAdapter(creds, { fetchImpl });
    const sims = await adapter.listSims();
    assert.equal(sims.length, 1);
    assert.equal(sims[0].iccid, '89148000000000000001');
    assert.equal(sims[0].status, 'active');
    assert.equal(sims[0].plan, 'IoT 1GB');
  });

  it('suspends device via actions endpoint', async () => {
    const fetchImpl = mock.fn(async (url, init) => {
      const u = String(url);
      if (u.includes('/oauth2/token')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'oauth-tok' }) };
      }
      if (u.includes('/session/login')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ sessionToken: 'sess-tok' }) };
      }
      if (u.includes('/devices/actions/suspend')) {
        const body = JSON.parse(init.body);
        assert.equal(body.accountName, creds.accountName);
        assert.equal(body.deviceIds[0].kind, 'iccid');
        return { ok: true, status: 200, text: async () => '{}' };
      }
      if (u.includes('/devices/actions/list')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ devices: [] }) };
      }
      throw new Error(`unexpected url ${u}`);
    });

    const adapter = new VerizonAdapter(creds, { fetchImpl });
    const result = await adapter.deactivateSim('89148000000000000001');
    assert.equal(result.ok, true);
    assert.equal(result.status, 'paused');
  });
});

describe('TwilioWirelessAdapter', () => {
  it('lists sims and usage from mocked API', async () => {
    const fetchImpl = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/UsageRecords')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            usage_records: [{ sim_sid: 'HSabc', data_upload: 1048576, data_download: 1048576 }],
            meta: {},
          }),
        };
      }
      if (u.includes('/Sims')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            sims: [{ sid: 'HSabc', iccid: '89883070000123456789', status: 'active' }],
            meta: {},
          }),
        };
      }
      throw new Error(`unexpected url ${u}`);
    });

    const adapter = new TwilioWirelessAdapter({ accountSid: 'ACx', authToken: 'secret' }, { fetchImpl });
    const sims = await adapter.listSims();
    assert.equal(sims.length, 1);
    assert.equal(sims[0].iccid, '89883070000123456789');
    assert.equal(sims[0].dataUsageMb, 2);
  });
});

describe('simStore fallback', () => {
  before(() => {
    simStore.resetFallbackForTests([]);
  });

  after(async () => {
    await simStore.close();
  });

  it('upserts and lists sims', async () => {
    const doc = normalizeSimRecord({
      iccid: '8901000000000000999',
      vendor: 'hologram',
      vendorSimId: '1',
      status: 'active',
    });
    await simStore.upsertFromVendor(doc);
    const listed = await simStore.list();
    assert.equal(listed.length, 1);
    const updated = await simStore.update(listed[0].id, { deviceId: 'opta_test' });
    assert.equal(updated.deviceId, 'opta_test');
  });
});

async function withApi(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api', createCellularSimRoutes());
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api/cellular`;
  try {
    return await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('sim billing report', () => {
  it('builds tenant billing summary and csv export', () => {
    const period = { periodStart: '2026-08-01 00:00:00', periodEnd: '2026-08-11 00:00:00' };
    const sims = [{
      id: 'csim_1',
      iccid: '89019900000003070001',
      eid: '89034011014200000000000000871001',
      vendor: 'simetry',
      status: 'active',
      tenantId: 'acme',
      metadata: {
        billing: {
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          usageMb: 5,
          serviceFee: 1.5,
          amount: 11,
          currency: 'USD',
          planName: 'USA 1GB Plan',
          syncedAt: '2026-08-11T12:00:00.000Z',
        },
      },
    }];
    const report = buildBillingReport(sims, period);
    assert.equal(report.lines.length, 1);
    assert.equal(report.summary.totalAmount, 12.5);
    assert.equal(report.summary.totalUsageMb, 5);
    const csv = billingReportToCsv(report);
    assert.match(csv, /89019900000003070001/);
    assert.match(csv, /acme/);
  });
});

describe('cellular sim API', () => {
  before(() => {
    simStore.resetFallbackForTests([]);
    writeCellularSimsSettings({ enabled: true, vendors: [] });
  });

  after(async () => {
    await simStore.close();
  });

  it('returns vendor catalog and accepts vendor config', async () => {
    await withApi(async (base) => {
      const catalogRes = await fetch(`${base}/vendors/catalog`);
      assert.equal(catalogRes.status, 200);
      const catalog = await catalogRes.json();
      assert.equal(catalog.vendors.length, 11);
      const hologram = catalog.vendors.find((v) => v.id === 'hologram');
      const twilio = catalog.vendors.find((v) => v.id === 'twilio');
      assert.ok(hologram?.displayName && hologram.displayName !== 'hologram');
      assert.ok(twilio?.displayName && twilio.displayName !== 'twilio');
      assert.ok(catalog.vendors.every((v) => v.id && v.displayName));

      const addRes = await fetch(`${base}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: 'hologram',
          label: 'Test',
          credentials: { apiKey: 'fake-key', orgId: '1' },
        }),
      });
      assert.equal(addRes.status, 201);
      const { vendor } = await addRes.json();
      assert.equal(vendor.vendorId, 'hologram');
      assert.equal(vendor.credentials.apiKey, '••••••••');
    });
  });

  it('syncs hologram inventory via manager with mocked fetch', async () => {
    const fetchImpl = mock.fn(async (url) => {
      if (String(url).includes('hologram.io')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            data: [{
              id: 1,
              links: { cellular: [{ id: 9, sim: '8901000000000000123', state: 'LIVE' }] },
            }],
          }),
        };
      }
      return { ok: true, status: 200, text: async () => '{}' };
    });

    writeCellularSimsSettings({
      enabled: true,
      vendors: [{
        id: 'cv_test',
        vendorId: 'hologram',
        label: 'Mock',
        enabled: true,
        credentials: { apiKey: 'k' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    });

    const result = await simManager.syncAll({ fetchImpl });
    assert.equal(result.results[0].synced, 1);
    assert.equal(result.count, 1);

    await withApi(async (base) => {
      const listRes = await fetch(`${base}/sims`);
      const data = await listRes.json();
      assert.equal(data.count, 1);
      assert.equal(data.sims[0].iccid, '8901000000000000123');
    });
  });

  it('returns 403 when cellular sims disabled', async () => {
    delete process.env.PEAKLOGIC_CELLULAR_SIMS;
    persistence.writeJson('settings.json', { cellularSims: { enabled: false, vendors: [] } });
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/cellular/cellularSimsEnabled')];
    delete require.cache[require.resolve('../src/api/routes/cellularSims')];
    const { createCellularSimRoutes: gatedRoutes } = require('../src/api/routes/cellularSims');
    const app = express();
    app.use(express.json());
    app.use('/api', gatedRoutes());
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cellular/sims`);
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
      process.env.PEAKLOGIC_CELLULAR_SIMS = '1';
      delete require.cache[require.resolve('../src/config')];
      delete require.cache[require.resolve('../src/cellular/cellularSimsEnabled')];
      delete require.cache[require.resolve('../src/api/routes/cellularSims')];
    }
  });

  it('allows cellular sims when settings.cellularSims.enabled is true', async () => {
    delete process.env.PEAKLOGIC_CELLULAR_SIMS;
    persistence.writeJson('settings.json', { cellularSims: { enabled: true, vendors: [] } });
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/cellular/cellularSimsEnabled')];
    delete require.cache[require.resolve('../src/api/routes/cellularSims')];
    const { isCellularSimsEnabled } = require('../src/cellular/cellularSimsEnabled');
    assert.equal(isCellularSimsEnabled(), true);
    process.env.PEAKLOGIC_CELLULAR_SIMS = '1';
    delete require.cache[require.resolve('../src/cellular/cellularSimsEnabled')];
  });
});

describe('gateway cellular ingest', () => {
  before(() => {
    simStore.resetFallbackForTests([]);
    writeCellularSimsSettings({ enabled: true, vendors: [] });
    persistence.writeJson('gateway_cellular.json', { reports: {} });
  });

  after(async () => {
    await simStore.close();
  });

  it('auto-links SIM when gateway publishes matching ICCID', async () => {
    const iccid = '89019900000003079999';
    await simStore.upsertFromVendor(normalizeSimRecord({
      iccid,
      vendor: 'simetry',
      vendorSimId: '89034011014200000000000000879999',
      status: 'active',
    }));

    const { ingestGatewayCellularMessage } = require('../src/cellular/gatewayCellularIngest');
    const result = await ingestGatewayCellularMessage(
      'peaklogic/v1/gateway/gw_nanopi_ab12cd/cellular',
      JSON.stringify({
        gatewayId: 'gw_nanopi_ab12cd',
        platform: 'nanopi-neo-cat1',
        iccid,
        imsi: '234500024513999',
      }),
      { topicPrefix: 'peaklogic/v1' },
    );

    assert.equal(result.ok, true);
    assert.equal(result.autoLink.linked, true);
    assert.equal(result.autoLink.gatewayId, 'gw_nanopi_ab12cd');
    const sim = await simStore.findByIccidAny(iccid);
    assert.equal(sim.gatewayId, 'gw_nanopi_ab12cd');
  });

  it('stores report and suggests sync when ICCID is unknown', async () => {
    const { ingestGatewayCellularMessage } = require('../src/cellular/gatewayCellularIngest');
    const result = await ingestGatewayCellularMessage(
      'peaklogic/v1/gateway/gw_nanopi_new01/cellular',
      JSON.stringify({
        gatewayId: 'gw_nanopi_new01',
        iccid: '89019900000003111111',
      }),
      { topicPrefix: 'peaklogic/v1' },
    );
    assert.equal(result.ok, true);
    assert.equal(result.autoLink.suggestSync, true);
    assert.equal(result.report.gatewayId, 'gw_nanopi_new01');
  });
});

describe('device cellular sync', () => {
  before(() => {
    simStore.resetFallbackForTests([]);
    writeCellularSimsSettings({ enabled: true, vendors: [] });
    persistence.writeJson('gateway_cellular.json', {
      reports: {
        gw_nanopi_ab12cd: {
          gatewayId: 'gw_nanopi_ab12cd',
          platform: 'nanopi-neo-cat1',
          iccid: '89019900000003078888',
          imsi: '234500024513888',
          receivedAt: new Date().toISOString(),
        },
      },
    });
    registry.reloadFromPersistence();
    registry.ingestReport({
      deviceId: 'opta_012355b52d66a109ee',
      platform: 'arduino-opta-mqtt-st',
      mqttBroker: '192.168.1.1',
      ethIp: '192.168.1.55',
    });
    return simStore.upsertFromVendor(normalizeSimRecord({
      iccid: '89019900000003078888',
      vendor: 'simetry',
      vendorSimId: '89034011014200000000000000878888',
      eid: '89034011014200000000000000878888',
      status: 'active',
    }));
  });

  after(async () => {
    await simStore.close();
  });

  it('links Opta device registration to gateway ICCID and Simetry eID', async () => {
    const { syncDeviceCellularRegistration } = require('../src/cellular/deviceCellularSync');
    const result = await syncDeviceCellularRegistration({
      deviceId: 'opta_012355b52d66a109ee',
      tenantId: 'acme',
      report: registry.getDevice('opta_012355b52d66a109ee'),
    });
    assert.equal(result.ok, true);
    assert.equal(result.cellular.iccid, '89019900000003078888');
    assert.equal(result.cellular.eid, '89034011014200000000000000878888');
    assert.equal(result.cellular.gatewayId, 'gw_nanopi_ab12cd');
    assert.equal(result.autoLink.linked, true);
    const dev = registry.getDevice('opta_012355b52d66a109ee');
    assert.equal(dev.meta.cellular.iccid, '89019900000003078888');
    assert.match(result.registration.cellular.eid, /^890340/);
  });
});

describe('cellular sims frontend client', () => {
  it('exposes getCellularVendorCatalog in public/js/api.js', () => {
    const apiJs = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');
    assert.match(apiJs, /getCellularVendorCatalog:\s*\(\)\s*=>\s*request\('GET',\s*'\/cellular\/vendors\/catalog'\)/);
    assert.match(apiJs, /getCellularVendors:\s*\(\)\s*=>\s*request\('GET',\s*'\/cellular\/vendors'\)/);
  });

  it('loads versioned api.js on cellular-sims page (avoids stale browser cache)', () => {
    const page = fs.readFileSync(path.join(__dirname, '../views/cellular-sims.ejs'), 'utf8');
    assert.match(page, /<script src="\/js\/api\.js\?v=<%= assetV %>"><\/script>/);
    assert.match(page, /<script src="\/js\/cellularSimsPage\.js\?v=<%= assetV %>"><\/script>/);
    assert.match(page, /cellular-billing-section/);
  });

  it('exposes cellular billing API helpers in public/js/api.js', () => {
    const apiJs = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');
    assert.match(apiJs, /syncCellularBilling:/);
    assert.match(apiJs, /getCellularBillingReport:/);
    assert.match(apiJs, /exportCellularBillingCsv:/);
    assert.match(apiJs, /getCellularGatewayReports:/);
  });
});

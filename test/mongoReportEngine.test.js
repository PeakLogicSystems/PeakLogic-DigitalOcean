'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-mongo-report-'));

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoSysLog = require('../src/logger/mongoSysLog');
const persistence = require('../src/persistence');
const { runMongoReport } = require('../src/reports/mongoReportEngine');
const { normalizeReportSpec } = require('../src/reports/mongoReportDefs');
const { listCatalog } = require('../src/reports/mongoReportCatalog');

describe('mongo report engine', () => {
  before(async () => {
    await mongoSysLog.setConfig(null);
    await mongoSysLog.append({
      level: 'info',
      category: 'alarms',
      message: 'Alarm acknowledged (TAG1) by Operator',
      user: { name: 'Operator', email: 'op@example.com' },
    });
  });

  after(async () => {
    await mongoSysLog.close();
  });

  it('lists catalog sources and templates', () => {
    const cat = listCatalog();
    assert.ok(cat.sources.some((s) => s.id === 'sys_log'));
    assert.ok(cat.sources.some((s) => s.id === 'roi_summary'));
    assert.ok(cat.templates.some((t) => t.id === 'alarm_acks'));
    assert.ok(cat.templates.some((t) => t.id === 'roi_assets'));
  });

  it('queries ROI summary from saved settings', async () => {
    persistence.writeJson('settings.json', {
      roi: {
        leakDetection: {
          systemCost: 5000,
          amortizationYears: 5,
          repairCostPerEvent: 100,
          eventsPerYear: 6,
        },
        pool: {
          pumpUpgradeCost: 2000,
          chemicalSystemCost: 1500,
          amortizationYears: 7,
          monthlyEnergySavings: 50,
          monthlyChemicalSavings: 25,
        },
      },
    });
    const result = await runMongoReport({ sourceId: 'roi_summary' });
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0].asset, 'Leak detection');
    assert.equal(result.rows[0].annualGrossSavings, '600');
    assert.equal(result.rows[1].asset, 'Pool (pump & chemistry)');
    assert.equal(result.rows[1].upfrontCost, '3500');
    assert.equal(result.rows[2].asset, 'Combined');
    assert.equal(result.rows[2].upfrontCost, '8500');
  });

  it('queries system log with category filter', async () => {
    const result = await runMongoReport({
      sourceId: 'sys_log',
      filter: { category: 'alarms' },
      columns: ['at', 'category', 'message', 'user.name'],
      limit: 10,
    });
    assert.equal(result.ok, true);
    assert.ok(result.rows.length >= 1);
    assert.equal(result.rows[0].category, 'alarms');
    assert.match(result.rows[0].message, /Alarm acknowledged/);
  });

  it('normalizes report spec defaults', () => {
    const spec = normalizeReportSpec({ sourceId: 'sys_log' });
    assert.equal(spec.sourceId, 'sys_log');
    assert.ok(Array.isArray(spec.columns));
    assert.equal(spec.sortDir, -1);
  });
});

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-cmms-'));

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const cmmsStore = require('../src/cmms/cmmsStore');
const { runMongoReport } = require('../src/reports/mongoReportEngine');
const { listCatalog } = require('../src/reports/mongoReportCatalog');

describe('cmms store', () => {
  it('creates and lists work orders', () => {
    const wo = cmmsStore.createWorkOrder({
      title: 'Fix leak sensor',
      assetId: 'pump-101',
      priority: 'high',
    });
    assert.match(wo.number, /^WO-/);
    assert.equal(wo.status, 'open');
    const rows = cmmsStore.listWorkOrders({ filter: { status: 'open' } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Fix leak sensor');
  });

  it('generates work orders from overdue PM', () => {
    const pm = cmmsStore.createPmSchedule({
      title: 'Quarterly inspection',
      assetId: 'pump-101',
      intervalDays: 30,
      nextDueAt: new Date(Date.now() - 86400000).toISOString(),
    });
    const result = cmmsStore.generateDuePmWorkOrders();
    assert.equal(result.count, 1);
    assert.equal(result.created[0].source, 'pm');
    assert.equal(result.created[0].sourceRef, pm.id);
    const again = cmmsStore.generateDuePmWorkOrders();
    assert.equal(again.count, 0);
  });

  it('completes PM and rolls next due date', () => {
    const pm = cmmsStore.createPmSchedule({
      title: 'Monthly lube',
      intervalDays: 30,
      nextDueAt: new Date().toISOString(),
    });
    const done = cmmsStore.completePmSchedule(pm.id);
    assert.ok(done.lastCompletedAt);
    assert.ok(Date.parse(done.nextDueAt) > Date.now());
  });
});

describe('cmms reporting', () => {
  it('lists CMMS templates in catalog', () => {
    const cat = listCatalog();
    assert.ok(cat.sources.some((s) => s.id === 'cmms_work_orders'));
    assert.ok(cat.sources.some((s) => s.id === 'cmms_pm_schedules'));
    assert.ok(cat.templates.some((t) => t.id === 'open_work_orders'));
    assert.ok(cat.templates.some((t) => t.id === 'overdue_pm'));
  });

  it('queries open work orders for reports', async () => {
    const wo = cmmsStore.createWorkOrder({ title: 'Open task for report', status: 'open' });
    cmmsStore.createWorkOrder({ title: 'Done task for report', status: 'complete' });
    const result = await runMongoReport({
      sourceId: 'cmms_work_orders',
      filter: { status: 'open' },
      columns: ['number', 'title', 'status'],
    });
    assert.equal(result.ok, true);
    assert.ok(result.rows.some((r) => r.title === 'Open task for report'));
    assert.ok(!result.rows.some((r) => r.title === 'Done task for report'));
    assert.ok(result.rows.some((r) => r.number === wo.number));
  });
});

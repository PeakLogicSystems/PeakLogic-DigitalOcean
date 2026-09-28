'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const persistence = require('../src/persistence');
const cmmsStore = require('../src/cmms/cmmsStore');
const {
  maybeCreatePdmFailureWorkOrder,
  appendServiceHistoryFromWorkOrder,
  pdmSourceRef,
} = require('../src/cmms/pdmCmmsBridge');

describe('pdmCmmsBridge', () => {
  it('creates proactive PM work order on pending failure severity', () => {
    persistence.writeJson('cmms.json', { workOrders: [], pmSchedules: [], nextWoSeq: 1 });
    persistence.writeJson('settings.json', {
      cmms: { autoWorkOrdersFromPdm: true },
      pdm: { assetContext: { 'pump-2': { motorType: 'pump', locationClass: 'restaurant' } } },
    });
    const forecast = {
      ok: true,
      severity: 'warning',
      rulDaysEstimate: 22,
      headline: 'pump-2: pending failure in ~22 days',
      predictedFailureAt: new Date(Date.now() + 22 * 86400000).toISOString(),
      reportLines: ['Run amps creeping upward'],
    };
    const wo1 = maybeCreatePdmFailureWorkOrder('pump-2', { forecast });
    const wo2 = maybeCreatePdmFailureWorkOrder('pump-2', { forecast });
    assert.ok(wo1);
    assert.equal(wo1.source, 'pdm');
    assert.equal(wo1.sourceRef, pdmSourceRef('pump-2'));
    assert.match(wo1.title, /Proactive PM/);
    assert.equal(wo2, null);
    const rows = cmmsStore.listWorkOrders({ filter: { source: 'pdm' } });
    assert.equal(rows.length, 1);
  });

  it('escalates priority when severity worsens', () => {
    persistence.writeJson('cmms.json', { workOrders: [], pmSchedules: [], nextWoSeq: 1 });
    persistence.writeJson('settings.json', { cmms: { autoWorkOrdersFromPdm: true } });
    maybeCreatePdmFailureWorkOrder('pump-1', {
      forecast: { ok: true, severity: 'warning', rulDaysEstimate: 20, headline: 'warn' },
    });
    const updated = maybeCreatePdmFailureWorkOrder('pump-1', {
      forecast: { ok: true, severity: 'critical', rulDaysEstimate: 5, headline: 'critical' },
    });
    assert.ok(updated);
    assert.equal(updated.priority, 'urgent');
  });

  it('skips when auto work orders disabled', () => {
    persistence.writeJson('cmms.json', { workOrders: [], pmSchedules: [], nextWoSeq: 1 });
    persistence.writeJson('settings.json', { cmms: { autoWorkOrdersFromPdm: false } });
    const wo = maybeCreatePdmFailureWorkOrder('pump-1', {
      forecast: { ok: true, severity: 'critical', rulDaysEstimate: 3 },
    });
    assert.equal(wo, null);
  });

  it('appends service history when PdM work order completes', () => {
    persistence.writeJson('cmms.json', { workOrders: [], pmSchedules: [], nextWoSeq: 1 });
    persistence.writeJson('settings.json', {
      cmms: { appendServiceHistoryOnWoComplete: true },
      pdm: {
        assetContext: {
          'pump-2': { motorType: 'pump', serviceHistory: [{ date: '2020-01-01', type: 'install' }] },
        },
      },
    });
    const wo = cmmsStore.createWorkOrder({
      title: 'Proactive PM: pump-2 — pending failure',
      assetId: 'pump-2',
      source: 'pdm',
      sourceRef: pdmSourceRef('pump-2'),
      status: 'complete',
      completedAt: '2026-07-20T12:00:00.000Z',
    });
    appendServiceHistoryFromWorkOrder(wo);
    const settings = persistence.readJson('settings.json', {});
    const hist = settings.pdm.assetContext['pump-2'].serviceHistory;
    assert.equal(hist.length, 2);
    assert.equal(hist[1].type, 'pdm_pm');
    assert.match(hist[1].notes, /WO-/);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const persistence = require('../src/persistence');
const cmmsStore = require('../src/cmms/cmmsStore');
const { maybeCreateAlarmWorkOrder } = require('../src/cmms/cmmsAlarmBridge');

describe('cmmsAlarmBridge', () => {
  it('creates alarm-sourced work order once per tag/level', () => {
    persistence.writeJson('cmms.json', { workOrders: [], pmSchedules: [], nextWoSeq: 1 });
    persistence.writeJson('settings.json', { cmms: { autoWorkOrdersFromAlarms: true } });
    const evt = { tagId: 'TANK1_LEVEL', level: 'outerHigh', value: 92.5, since: Date.now() };
    const wo1 = maybeCreateAlarmWorkOrder(evt);
    const wo2 = maybeCreateAlarmWorkOrder(evt);
    assert.ok(wo1);
    assert.equal(wo1.source, 'alarm');
    assert.equal(wo2, null);
    const rows = cmmsStore.listWorkOrders({ filter: { source: 'alarm' } });
    assert.equal(rows.length, 1);
  });

  it('skips when auto work orders disabled', () => {
    persistence.writeJson('cmms.json', { workOrders: [], pmSchedules: [], nextWoSeq: 1 });
    persistence.writeJson('settings.json', { cmms: { autoWorkOrdersFromAlarms: false } });
    const wo = maybeCreateAlarmWorkOrder({ tagId: 'X', level: 'outerHigh', value: 1 });
    assert.equal(wo, null);
  });
});
